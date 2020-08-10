const fs = require('fs');
const path = require('path');
const htmlminify = require('html-minifier').minify;
const uglifyes = require('uglify-es');
const lzma = require('lzma');
const QRCode = require('qrcode');

function main() {
    const game_file = process.argv[2];
    if (!fs.existsSync(game_file)) {
        console.error("Game file does not exist: ", game_file);
        return;
    }

    // read html
    let html = fs.readFileSync(game_file, "utf8");

    // include game style
    const css_file = game_file.replace('.html', '.css');
    let css = fs.readFileSync(css_file, 'utf8');

    html = html.replace(new RegExp(`<\\s*link\\s.*?${path.basename(css_file)}.*?>`), `<style>${css}</style>`);

    // minify HTML & CSS
    html = htmlminify(html, {
        caseSensitive: false,
        collapseBooleanAttributes: true,
        collapseInlineTagWhitespace: true,
        collapseWhitespace: true,
        decodeEntities: true,
        html5: true,
        minifyCSS: true,
        minifyJS: true,
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

    // minimize js
    const js_file = game_file.replace('.html', '.js');
    let js = fs.readFileSync(js_file, 'utf8');
    // noinspection JSUnresolvedFunction
    js = uglifyes.minify(js, {
        toplevel: true
    }).code;

    // include js
    html = html.replace(new RegExp(`<\\s*script\\s.*?${path.basename(js_file)}.*?>`), `<script>${js}`);

    const output_path = path.resolve(path.join(path.resolve(game_file), '..', 'dist', path.basename(game_file)));
    fs.mkdirSync(path.dirname(output_path), {recursive: true});
    fs.writeFileSync(output_path, html);
    const compressed = Buffer.from(lzma.compress(html, 9)).toString('base64');
    fs.writeFileSync(output_path + '.comp', compressed);
    QRCode.toFile(output_path + '.svg', [{data: 'https://itty.bitty.site/#/' + compressed}]);
}

main()
