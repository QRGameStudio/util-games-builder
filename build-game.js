const fs = require('fs');
const base32 = require('base32');
const path = require('path');
const htmlminify = require('html-minifier').minify;
const uglifyes = require('uglify-es');
const lzma = require('lzma');
const QRCode = require('qrcode');
const cp = require("child_process");

function main() {
    const scriptDir = path.resolve(path.join(process.argv[1], '..'))
    const game_file = process.argv[2];
    if (!fs.existsSync(game_file)) {
        console.error("Game file does not exist: ", game_file);
        return;
    }

    // read html
    let html = fs.readFileSync(game_file, "utf8");

    // include game style
    const css_file = game_file.replace('.html', '.css');
    if (fs.existsSync(css_file)) {
        let css = fs.readFileSync(css_file, 'utf8');
        html = html.replace(new RegExp(`<\\s*link\\s.*?${path.basename(css_file)}.*?>`), `<style>${css}</style>`);
    }

    // minimize js
    let js_re_res;
    let js_re_index = 0;
    while(true) {
        js_re_res = /<\s*script\s.*?src=["'](.*)["'].*?>/g.exec(html.substring(js_re_index));
        if (!js_re_res) {
            break;
        }
        html = include_js(html, js_re_res[1]);
        js_re_index += js_re_res.index + js_re_res[0].length;
    }

    // minify HTML & CSS
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

    const output_path = path.resolve(path.join(path.resolve(game_file), '..', 'dist', path.basename(game_file)));
    fs.mkdirSync(path.dirname(output_path), {recursive: true});
    fs.writeFileSync(output_path, html);

    const compressed = Buffer.from(lzma.compress(html, 9));
    fs.writeFileSync(output_path + '.bin', compressed);
    const b64 = compressed.toString('base64');
    fs.writeFileSync(output_path + '.b64.txt', b64);

    const b32 = base32.encode(compressed).toUpperCase();
    fs.writeFileSync(output_path + '.b32.txt', b32);
    fs.writeFileSync(output_path + '.b32a.txt', adaptiveCompression(b32));

    const url = 'http://qrpr.eu/h#' + b64;
    console.log(url);
    fs.writeFileSync(output_path + '.url.txt', url);

    const url32 = 'HTTP://QRPR.EU/H/' + b32;

    // CMIX compressed ( https://github.com/byronknoll/cmix )
    const cmixExec = path.resolve(scriptDir,'bin', 'cmix');
    if (fs.existsSync(cmixExec) && false) {
        console.log('starting cmix compression (may take a while)');
        const cmixOutputPath = `${output_path}.cmix`;
        cp.execSync(`${cmixExec} -c ${output_path} ${cmixOutputPath}`);
        const cmixOutput = fs.readFileSync(cmixOutputPath);
        const cmixData = 'CC' + adaptiveCompression(base32.encode(cmixOutput).toUpperCase());
        fs.writeFileSync(`${cmixOutputPath}.txt`, cmixData);
        QRCode.toFile(output_path + '.cmix.svg', [{data: cmixData}]);
        QRCode.toFile(output_path + '.cmix.png', [{data: cmixData}]);
    }

    // CB compressed
    const compressedQRData = 'CB' + adaptiveCompression(base32.encode(compressed).toUpperCase());
    adaptiveCompression(compressedQRData);
    fs.writeFileSync(output_path + '.comp.txt', compressedQRData);

    QRCode.toFile(output_path + '.comp.svg', [{data: compressedQRData}]);
    QRCode.toFile(output_path + '.comp.png', [{data: compressedQRData}]);

    // URL compressed
    QRCode.toFile(output_path + '.svg', [{data: url}]);
    QRCode.toFile(output_path + '.png', [{data: url}]);

    // Base 32 URL compressed
    QRCode.toFile(output_path + '.b32.svg', [{data: url32}]);
    QRCode.toFile(output_path + '.b32.png', [{data: url32}]);
}

function include_js(html, js_file) {
    let js = fs.readFileSync(js_file, 'utf8');
    // noinspection JSUnresolvedFunction
    js = uglifyes.minify(js, {
        toplevel: true
    }).code;

    // include js
    return html.replace(new RegExp(`<\\s*script\\s.*?${path.basename(js_file)}.*?>`), `<script>${js}`);
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
                currIs[i] ++;
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

main()
