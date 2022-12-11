const fs = require('fs');
const base32 = require('base32');
const path = require('path');
const htmlminify = require('html-minifier').minify;
const uglifyes = require('uglify-es');
const lzma = require('lzma');
const QRCode = require('qrcode');
const jsdom = require('jsdom');
const open = require('open');

const maxLength = 4296;
const recLenght = 3000; // TODO experimatally find reccomended max size of QR codes in order to easy scann

function main() {
    const args = [...process.argv];

    args.shift();
    args.shift();
    const game_file = args[0];
    const json_output = args.indexOf('--json') > -1;
    const generate_qr_code = args.indexOf('--no-qr') === -1;
    const minify = args.indexOf('--no-minify') === -1;

    if (!fs.existsSync(game_file)) {
        console.error("Game file does not exist: ", game_file);
        return;
    }

    const sourceFiles = [game_file];

    let after_action = null;
    if (process.argv.length >= 4) {
        switch (process.argv[3]) {
            case 'run':
                after_action = 'run';
                break;
            case 'debug':
                after_action = 'debug';
                break;
        }
    }

    // read html
    let html = fs.readFileSync(game_file, "utf8");

    // include game style
    const css_file = game_file.replace('.html', '.css');
    if (fs.existsSync(css_file)) {
        sourceFiles.push(css_file);
        let css = fs.readFileSync(css_file, 'utf8');
        html = html.replace(new RegExp(`<\\s*link\\s.*?${path.basename(css_file)}.*?>`), `<style>${css}</style>`);
    }

    // minimize js
    let js_re_res;
    let js_re_index = 0;
    while (true) {
        js_re_res = /<\s*script\s.*?src=["'](.*)["'].*?>/g.exec(html.substring(js_re_index));
        if (!js_re_res) {
            break;
        }
        const js_file = path.resolve(js_re_res[1]);
        html = includeJS(html, js_file, sourceFiles, minify);
        js_re_index += js_re_res.index + js_re_res[0].length;
    }

    // minify HTML & CSS
    if (minify) {
        html = htmlminify(html, {
            caseSensitive: false,
            collapseBooleanAttributes: true,
            collapseInlineTagWhitespace: true,
            collapseWhitespace: true,
            decodeEntities: true,
            html5: true,
            minifyCSS: true,
            minifyJS: false,
            minifyURLs: true,
            removeAttributeQuotes: true,
            removeComments: true,
            removeEmptyAttributes: true,
            removeEmptyElements: false,
            removeOptionalTags: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            removeTagWhitespace: true,
            sortAttributes: true,
            sortClassName: true,
        });
    }

    const output_path = path.resolve(path.join(path.resolve(game_file), '..', 'dist', path.basename(game_file)));
    const auxiliary_path = path.resolve(path.join(path.resolve(game_file), '..', 'dist', 'aux', path.basename(game_file)));
    fs.mkdirSync(path.dirname(auxiliary_path), {recursive: true});
    fs.mkdirSync(path.dirname(output_path), {recursive: true});
    fs.writeFileSync(output_path, html);

    // generate manifest from autodeveloping-server
    const gameManifest = getManifest(html);
    fs.writeFileSync(output_path + '.manifest.json', JSON.stringify(gameManifest, null, 2));

    html = mapHTML(html);
    fs.writeFileSync(auxiliary_path + '.repl.txt', html);

    const compressed = Buffer.from(lzma.compress(html, 9));
    fs.writeFileSync(auxiliary_path + '.bin', compressed);
    const b64 = compressed.toString('base64');
    fs.writeFileSync(auxiliary_path + '.b64.txt', b64);

    const b32 = 'CB' + base32.encode(compressed).toUpperCase();
    fs.writeFileSync(output_path + '.compiled.txt', b32);
    fs.writeFileSync(auxiliary_path + '.b32a.txt', adaptiveCompression(b32));
    fs.writeFileSync(auxiliary_path + '.b32.url.txt', `http://qrpr.eu/html.html#${b32}`);

    const urlDebug = 'http://qrpr.eu/html.html#' + b32;
    fs.writeFileSync(auxiliary_path + '.url.txt', urlDebug);

    const urlProd = 'https://QGO.EU/GAME#' + b32;

    const url32Data = [
        {data: 'https', mode: 'bytes'},
        {data: '://QGO.EU/GAME/', mode: 'alphanumeric'},
        {data: '#', mode: 'bytes'},
        {data: b32, mode: 'alphanumeric'}
    ];

    if (!json_output) {
        printInfoToConsole(b32, b64);
    } else {
        console.log(JSON.stringify({
            b32, b64, urlProd, urlDebug, sourceFiles
        }))
    }

    if (generate_qr_code) {
        QRCode.toFile(output_path + '.svg', url32Data);
        QRCode.toFile(output_path + '.png', url32Data);
    }

    if (after_action) {
        switch (after_action) {
            case 'debug':
                open(urlDebug);
                break;
            case 'run':
                open(urlProd)
                break;
        }
    }
}

function getManifest(html) {
    const { JSDOM } = jsdom;
    const document = new JSDOM(html).window.document;

    const manifest = {
        name: null,
        id: null,
        secret: null,
        version: null
    }

    const title = document.querySelector('title');
    if (title) {
        manifest.name = title.text;
    }

    const metaTags = document.getElementsByTagName('meta');
    for (let meta of metaTags) {
        const c = meta.content;
        let k = null;
        switch (meta.name) {
            case 'gi':
                k = 'id';
                break;
            case 'gv':
                k = 'version';
                break;
            case 'gs':
                k = 'secret';
                break;
        }
        if (k) {
            manifest[k] = c;
        }
    }

    return manifest;
}

/**
 * Include new javascript file inside HTML code
 * @param html {string} HTML code
 * @param js_file {string} path to the JS file
 * @param sourceFiles {string[]} list of all source files
 * @param minify {boolean} if set to false, then minification of the JS is not performed
 * @return {string} HTML with included JS code
 */
function includeJS(html, js_file, sourceFiles, minify) {
    const js = loadJS(js_file, sourceFiles, minify);

    // include js
    return html.replace(new RegExp(`<\\s*script\\s.*?${path.basename(js_file)}.*?>`),
        () => `<script>${js}`);
}

/**
 * Loads javascript code, resolving all imports
 * @param js_path {string} path to the JS file
 * @param sourceFiles {string[]} list of all source files
 * @param minify {boolean} if set to false, then minification of the JS is not performed
 * @return {string}
 */
function loadJS(js_path, sourceFiles = [], minify = true) {
    if (sourceFiles.indexOf(js_path) > -1) {
        return ''; // already included, do nothing
    }
    sourceFiles.push(js_path);

    let js = fs.readFileSync(js_path, 'utf8');

    const reImport = /\/\/\s*!G\.import\('(.*?)'\)/g;
    const replaceMap = new Map();
    let found;
    while ((found = reImport.exec(js)) !== null) {
        const import_path = path.join(path.resolve(path.join(js_path, '..')), found[1]);
        const match = found[0];

        if (sourceFiles.indexOf(import_path) > -1) {
            continue;
        }

        replaceMap.set(match, '\n' + loadJS(import_path, sourceFiles, false) + '\n');
    }

    for (let [match, code] of replaceMap.entries()) {
        js = js.replace(match, code);
    }

    if (minify) {
        // noinspection JSUnresolvedFunction
        js = uglifyes.minify(js, {
            toplevel: true,
            mangle: {
                reserved: ['$']
            }
        }).code;
    }

    return js;
}

function mapHTML(html) {
    const mapVersion = '1';
    const map = {
        '0': 'left',
        '1': '.map',
        '2': 'else',
        '3': 'body',
        '4': 'then',
        '5': 'top',
        '6': 'for',
        '7': '===',
        '8': 'var',
        '9': 'new',
        a:
            '<meta content="width=device-width,initial-scale=1"name=viewport>',
        b: 'document.createElement(',
        c: '.getBoundingClientRect(',
        d: '.classList.contains',
        e: '.classList.remove',
        f: 'background-color',
        g: '<!DOCTYPE html>',
        h: '.classList.add',
        i: 'clearInterval(',
        j: 'window.onload',
        k: 'setInterval(',
        l: 'game-content',
        m: 'appendChild(',
        n: 'clearTimeout',
        o: 'setTimeout(',
        p: 'transparent',
        q: 'font-weight',
        r: '.classList',
        s: 'background',
        t: '.className',
        u: 'Math.max(',
        v: 'Math.min(',
        w: 'font-size',
        x: 'direction',
        y: 'position',
        z: '.forEach',
        A: 'function',
        B: '.onclick',
        C: 'content',
        D: '<script',
        E: 'padding',
        F: 'display',
        G: '.filter',
        H: 'return',
        I: 'center',
        J: 'length',
        K: 'margin',
        L: 'border',
        M: 'height',
        N: 'bottom',
        O: 'async',
        P: 'while',
        Q: 'this.',
        R: '<meta',
        S: 'Math.',
        T: 'width',
        U: 'await',
        V: 'right',
        W: 'color',
        X: 'speed',
        Y: '.get',
        Z: 'name'
    }

    html = replaceAll(html, '~', '~~');
    const tuples = Object.keys(map).map((k) => [k, map[k]]).sort((a, b) => b[1].length - a[1].length);
    for (let replacement of tuples) {
        html = replaceAll(html, replacement[1], `~${replacement[0]}`);
    }

    return `~R${mapVersion}~${html}`;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAll(str, find, replace) {
    return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

function adaptiveCompression(text) {
    let validCharacters = ' $%*+-./:'.split('').map(
        (c) => [c, (text.match(new RegExp(escapeRegExp(c), 'g')) || '').length]
    ).sort((a, b) => a[1] - b[1]).map((x) => x[0]);

    let replaceMatches = [];

    let _text_copy = `${text}`;
    let chars = [];
    let charsC = 0;
    let payOff = 0;
    while (_text_copy) {
        const charsCurr = _text_copy.substring(0, chars.length + 1);
        const charsCCurr = _text_copy.match(new RegExp(escapeRegExp(charsCurr), 'g')).length;
        const payOffCurr = charsCurr.length * charsCCurr;
        if (charsCCurr === charsCurr.length || payOffCurr < payOff) {
            replaceMatches.push([charsCurr, payOffCurr]);
            _text_copy = _text_copy.substring(chars.length + 1);
            continue;
        }
        chars = charsCurr;
        charsC = charsCCurr;
        payOff = payOffCurr;
    }
    replaceMatches = replaceMatches.sort((a, b) => (b[1] - a[1]));

    function ReplacementGenerator() {
        let replacementChars = validCharacters.slice();
        let currIs = [0];
        this.next = () => {
            const r = currIs.reverse().map((x) => replacementChars[x]).join('');
            for (let i = 0; i < currIs.length; i++) {
                currIs[i]++;
                if (currIs[i] === replacementChars.length) {
                    currIs[i] = 0;
                    if (i === currIs.length - 1) {
                        currIs = currIs.map(() => 0);
                        currIs.push(0);
                    }
                }
            }
            return r;
        };
    }

    const replacement = new ReplacementGenerator();
    const replaceMap = {};
    for (let match of replaceMatches) {
        const replacementCurr = replacement.next();
        if (match[0].length < replacementCurr.length + 1) {
            // this replacement does not pay off, stop replacing
            break;
        }
        replaceMap[replacementCurr] = match[0];
        text = replaceAll(text, match[0], `${replacementCurr}`);
    }

    const replacementMapFlat = Object.keys(replaceMap).map((k) => [k, replaceMap[k]]);
    if (replacementMapFlat) {
        let prefix = replacementMapFlat.map((x) => `${x[0]}${x[1]}`).join('') + replacementMapFlat[0][0];
        text = prefix + text;
    }
    return text;
}

function printInfoToConsole(b32, b64){
    const urlLength = b32.length + 20;
    console.log("\nUrl for debugging:\n\n", 'http://qrpr.eu/html.html#' + b64);
    console.log("\n\nProduction url:\n\n", "https://qgo.eu/Game/" + b32);

    console.log("\n\n\nUrl length:", urlLength);
    console.log("Reccomended max length:", recLenght);
    console.log("Max length:", maxLength)
    console.log("Used", Math.floor(100 * urlLength / recLenght), "% of reccomended programm size and", Math.floor(100 * urlLength / maxLength), "% of maximal programm size");
    printLine(urlLength);
}

function printLine(len){
    const color = len < recLenght ? "\x1b[32m" : len < maxLength ? "\x1b[33m" : "\x1b[31m"

    let res = " ";
    for(let i = 0; i < 100; i++)
        res += "_"
    res += "\n|" + color
    for(let i = 0; i < 100; i++)
        res += i <  100 * len / maxLength ? "█" : i === Math.ceil(100 * recLenght / maxLength) ? "\x1b[33m|" + color : " ";
    res += "\x1b[0m|\n ";
    for(let i = 0; i < 100; i++)
        res += "¯"
    console.log(res, "\n");
}

main()
