const app = require('express')();
const server = require('http').createServer(app);
// noinspection JSValidateTypes
const io = require('socket.io')(server);
const fs = require('fs');
const path = require('path');
const { spawn } = require("child_process");
const argv = require('minimist')(process.argv.slice(2));
const mime = require('mime-types');



/**
 * This program launches a development server that auto compiles your game whenever the source file changes
 *
 * Usage: node run-from-source.js /path/to/the/game.html [...additional paths to watch for change]
 */
const PORT = 3000;

const ARGS = process.argv.slice(2);

const WEB_PATH = path.resolve(argv['web-path']);
ARGS.shift();
const WEB_LIBS_PATH = path.resolve(argv['web-libs']);
ARGS.shift();

let GAME_WINDOW = false;
if (argv['window']) {
    GAME_WINDOW = true;
    ARGS.shift();
}


const GAME_FILE = path.resolve(ARGS[0]);
ARGS.shift();
const WATCHED_FILES = ARGS.map((f) => path.resolve(f));

process.chdir('/');  // work in root in order to handle current cwd deletion by automatic compilers

let signalFirstBuildFinished;

const BUILD = {
    address: '',
    gameFile: '',
    buildTime: 0,
    watchedFiles: [],
    finished: new Promise((resolve) => {signalFirstBuildFinished = resolve})
}

const CONNECTED_CLIENTS = [];


function startGameWindow() {
    const child = spawn(
            'python3',
            ['-c', `import webview; webview.create_window('QR Game', 'http://localhost:${PORT}/__autobuild/start'); webview.start()`],
            { detached: true, stdio: 'ignore' }
    );

    // Listen for the 'exit' event on the parent process
    process.on('exit', function() {
        // Kill the child process when the parent process exits
        child.kill();
    });

    child.unref();
}


function startHTTP() {
    app.get('/__autobuild/serve', function(req, res){
        res.sendFile(__dirname + '/autodeveloping-server/run-from-source.html');
    });

    app.get('/__autobuild/gameCodeRaw', function(req, res){
        res.sendFile(BUILD.gameFile);
    });

    app.get('/__autobuild/gameCodeAutoreload', function(req, res){
        const host = req.headers.host;
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        const hostComplete = `${proto}://${host}`;
        let content = fs.readFileSync(BUILD.gameFile).toString();
        content = content.replace('</body>', `<script src="/socket.io/socket.io.js"></script><script>(() => {const socket = io();socket.on('url', (url) => {if (! url.endsWith("${BUILD.buildTime}")) window.location.href = url.replaceAll('%WEB_HOST%', '${hostComplete}');});})();</script></body>`);
        res.send(content);
    });

    app.get('/__autobuild/start', function(req, res){
        const host = req.headers.host;
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        const hostComplete = `${proto}://${host}`;
        res.redirect(BUILD.address.replaceAll('%WEB_HOST%', hostComplete));
    });

    app.get('/__autobuild/buildTime', function(req, res){
        res.send(BUILD.buildTime.toString());
    });

    app.get('/lib/_GOffline.js', function(req, res){
       res.status(200).type('application/javascript').send('console.debug("[CACHE] disabled by development server")');
    });

    app.get('/__lib__qrpr_eu/*', (req, res) => {
        let filePath = req.path;
        filePath = path.join(WEB_LIBS_PATH, filePath.replace('/__lib__qrpr_eu/', ''));
        const mimeType = mime.lookup(filePath);
        // console.log('[LIB]', filePath);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.status(404).send('Not found');
            } else {
                res.status(200).type(mimeType).send(data);
            }
        });
    });

    app.get('*', (req, res) => {
        let filePath = req.path;
        const host = req.headers.host;
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        const hostComplete = `${proto}://${host}`;
        if (!filePath || filePath === '/') {
            filePath = '/index.html'
        }
        filePath = path.join(WEB_PATH, filePath);
        // console.log('[WEB]', filePath);
        const mimeType = mime.lookup(filePath);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.status(404).send('Not found');
            } else {
                let dataString = data.toString();
                dataString = dataString.replaceAll('https://api.qrpr.eu', hostComplete + '/__api_qrpr_eu')

                if (WEB_LIBS_PATH) {
                    dataString = dataString.replaceAll('https://lib.qrpr.eu', hostComplete + '/__lib__qrpr_eu');
                }

                res.status(200).type(mimeType).send(dataString);
            }
        });
    });

    console.log(`[SERVER] Listening on http://127.0.0.1:${PORT}/__autobuild/start`);
    server.listen(PORT);
}

function startSocketIO() {
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
    console.log('[BUILD] Build started');
    const start = Date.now();
    const pathBuilder = __dirname + '/build-game.js';

    const sub = spawn("node", [pathBuilder, GAME_FILE, "--json", "--no-qr", "--no-minify", "--no-aux"], {cwd: path.resolve(path.join(GAME_FILE, '..'))});
    let stdout = '';

    sub.stdout.on("data", data => {
        stdout += data;
    });

    sub.stderr.on("data", data => {
        console.error(data.toString('utf8'));
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
        BUILD.address =  `%WEB_HOST%/html.html#@@%WEB_HOST%/__autobuild/gameCodeAutoreload?built=${BUILD.buildTime}`;

        BUILD.watchedFiles.forEach((f) => fs.unwatchFile(f, ));

        BUILD.watchedFiles = [...buildData.sourceFiles, ...WATCHED_FILES];
        console.log('[BUILD] Build finished in', Date.now() - start, 'ms');
        signalFirstBuildFinished();

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
    startHTTP();
    startSocketIO();
    if (GAME_WINDOW) {
        BUILD.finished.then(() => startGameWindow());
    }
}

main();
