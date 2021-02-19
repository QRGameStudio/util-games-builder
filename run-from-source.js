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


const GAME_FILE = process.argv.length >= 3 ? process.argv[2] : null;
const WATCHED_FILES = process.argv.slice(3);

const BUILD = {
    address: '',
    watchedFiles: []
}

const CONNECTED_CLIENTS = []


function start_http() {
    app.get('/', function(req, res){
        res.sendFile(__dirname + '/autodeveloping-server/run-from-source.html');
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


const buildDebounced = debounce(() => build(), 5000);


function build() {
    console.log('building...')
    const pathBuilder = __dirname + '/build-game.js';

    const sub = spawn("node", [pathBuilder, GAME_FILE, "--json"], {cwd: path.resolve(path.join(GAME_FILE, '..'))});
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
        const buildData = JSON.parse(stdout);
        BUILD.address = buildData.urlDebug;

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
