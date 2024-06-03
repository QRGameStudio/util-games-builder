const app = require('express')();
const server = require('http').createServer(app);
// noinspection JSValidateTypes
const io = require('socket.io')(server);
const fs = require('fs');
const path = require('path');
const { spawn } = require("child_process");

/**
 * This program launches a development server that auto compiles your game whenever the source file changes
 *
 * Usage: node run-from-source.js /path/to/the/game.html [...additional paths to watch for change]
 */

const ARGS = process.argv.slice(2);
let WEB_PATH = 'https://qrpr.eu';
if (ARGS[0].startsWith('--web=')) {
    WEB_PATH = ARGS[0].split('=')[1];
    ARGS.shift();
}
const GAME_FILE = path.resolve(ARGS[0]);
ARGS.shift();
const WATCHED_FILES = ARGS.map((f) => path.resolve(f));

process.chdir('/');  // work in root in order to handle current cwd deletion by automatic compilers

const BUILD = {
    address: '',
    gameFile: '',
    buildTime: 0,
    watchedFiles: []
}

const CONNECTED_CLIENTS = [];


function start_http() {
    app.get('/', function(req, res){
        res.sendFile(__dirname + '/autodeveloping-server/run-from-source.html');
    });

    app.get('/gameCodeRaw', function(req, res){
        res.sendFile(BUILD.gameFile);
    });

    app.get('/buildTime', function(req, res){
        res.send(BUILD.buildTime.toString());
    });

    console.log('listening on http://127.0.0.1:3000')
    server.listen(3000);
}

function start_socket_io() {
    io.on('connection', (client) => {
        CONNECTED_CLIENTS.push(client);
        client.emit('url', BUILD.address);
    });
}

function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}


const buildDebounced = debounce(() => build(), 500);


function build() {
    console.log('building...')
    const pathBuilder = __dirname + '/build-game.js';

    const sub = spawn("node", [pathBuilder, GAME_FILE, "--json", "--no-qr", "--no-minify", "--no-aux"], {cwd: path.resolve(path.join(GAME_FILE, '..'))});
    let stdout = '';

    sub.stdout.on("data", data => {
        stdout += data;
    });

    sub.on('error', (error) => {
        console.error(`build failed with error: ${error.message}`);
    });

    sub.on("close", code => {
        if (code) {
            console.error(`build failed with error code: ${code}`);
            return;
        }
        let buildData;
        try {
            buildData = JSON.parse(stdout);
        } catch {
            console.error(`invalid data from builder: ${stdout}`);
            return;
        }
        BUILD.gameFile = buildData.htmlOutputPath;
        BUILD.buildTime = Date.now();
        BUILD.address =  `${WEB_PATH}/html.html#@@http://localhost:3000/gameCodeRaw?now=${BUILD.buildTime}`;

        BUILD.watchedFiles.forEach((f) => fs.unwatchFile(f, ));

        BUILD.watchedFiles = [...buildData.sourceFiles, ...WATCHED_FILES];
        console.log('build finished');

        BUILD.watchedFiles.forEach((f) => fs.watchFile(f, {persistent: false}, () => {
            buildDebounced();
        }))

        CONNECTED_CLIENTS.forEach((c) => {
            c.emit('url', BUILD.address);
        });
    });
}

function main() {
    if (!fs.existsSync(GAME_FILE)) {
        console.error(`Game file '${GAME_FILE}' does not exist`);
        process.exit(1);
    }
    build();
    start_http();
    start_socket_io();
}

main();
