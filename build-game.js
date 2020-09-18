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
    const url = 'http://qrpr.eu/h#' + b64;
    console.log(url);
    QRCode.toFile(output_path + '.svg', [{data: url}]);
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

main()
