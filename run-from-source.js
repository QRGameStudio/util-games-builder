const app = require('express')();
const server = require('http').createServer(app);
// noinspection JSValidateTypes
const io = require('socket.io')(server);
const fs = require('fs');
const path = require('path');
const { spawn } = require("child_process");


const GAME_FILE = process.argv[2];

const BUILD = {
    address: '',
    watchedFiles: ''
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
        BUILD.watchedFiles = buildData.sourceFiles;
        console.log('build finished')

        BUILD.watchedFiles.forEach((f) => fs.watch(f, {persistent: false}, () => {
            build();
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
