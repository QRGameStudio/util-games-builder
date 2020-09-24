function ReplacementGenerator() {
    let replacementChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01236456789".split('');
    let currIs = [0];
    this.next = () => {
        const r = currIs.map((x) => replacementChars[x]).reverse().join('');
        for (let i = 0; i < currIs.length; i++) {
            currIs[i] ++;
            if (currIs[i] >= replacementChars.length) {
                currIs[i] = 0;
                if (i === currIs.length - 1) {
                    currIs = currIs.map(() => 0);
                    currIs.push(0);
                    break;
                } else  {
                    currIs[i + 1] ++;
                }
            } else {
                break;
            }
        }
        return r;
    };
}

const mapped = [
    'function',
    'var',
    'return',
    'body',
    'appendChild(',
    'document.createElement(',
    'height',
    'width',
    'Math.max(',
    'Math.min(',
    'Math.',
    'this.',
    '.className',
    '.classList',
    '.classList.add',
    '.classList.contains',
    '.classList.remove',
    'for',
    'while',
    '.forEach',
    '.map',
    '.filter',
    'color',
    'background',
    'background-color',
    'game-content',
    'new',
    '.onclick',
    'window.onload',
    '.get',
    'setTimeout(',
    'setInterval(',
    'clearTimeout',
    'clearInterval(',
    'else',
    '.getBoundingClientRect(',
    'display',
    '===',
    'length',
    'padding',
    'margin',
    'border',
    '<meta content="width=device-width,initial-scale=1"name=viewport>',
    '<!DOCTYPE html>',
    '<meta',
    'content',
    'name',
    'font-size',
    'font-weight',
    'text',
    'transparent',
    'top',
    'left',
    'right',
    'bottom',
    'direction',
    'speed',
    'then',
    'await',
    'async',
    'center',
    'position',
    '<script'
].sort((a, b) => (b.length - a.length));

const map = {};
const gen = new ReplacementGenerator();

for (let item of mapped) {
    map[gen.next()] = item;
}

console.log(map);
