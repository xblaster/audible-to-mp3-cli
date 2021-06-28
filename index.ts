const world = 'world';

import {exec} from 'child_process';
import * as path from 'path';

const { program } = require('commander');
program.version('0.0.1');

program
    .option('-i, --input <path>', 'input file')

const fs = require('fs');

interface AudibleInfo {
    chapters: Array<AudibleChapter>,
    author: string,
    title: string
}

interface AudibleChapter {
    start: string,
    end: string,
    name: string
}


function mkDirByPathSync(targetDir: string, {isRelativeToScript = true} = {}) {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = isRelativeToScript ? __dirname : '.';

    return targetDir.split(sep).reduce((parentDir, childDir) => {
        const curDir = path.resolve(baseDir, parentDir, childDir);
        try {
           // console.log('try creating ' + curDir);
            fs.mkdirSync(curDir);
        } catch (err) {
            if (err.code === 'EEXIST') { // curDir already exists!
                return curDir;
            }

            // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
            if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
                throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
            }

            const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
            if (!caughtErr || caughtErr && targetDir === curDir) {
                throw err; // Throw if it's just the last created dir.
            }
        }

        return curDir;
    }, initDir);
}

function getChapters(ffmpegoutput: string) {
    const regxp = /.*Chapter #(\d+:\d+): start (\d+\.\d+), end (\d+\.\d+).*/g;
    let match = regxp.exec(ffmpegoutput);
    const res = [];
    while (match != null) {
        res.push({start: match[2], end: match[3], name: match[1]});
        match = regxp.exec(ffmpegoutput);
    }

    return res;
}

function getTitle(ffmpegoutput: string) {
    const regxp = /.*title.*: (.*)/g;
    const match = regxp.exec(ffmpegoutput);

    // @ts-ignore
    return match[1];
}

function getAuthor(ffmpegoutput: string) {
    const regxp = /.*artist.*: (.*)/g;
    const match = regxp.exec(ffmpegoutput);

    // @ts-ignore
    return match[1];
}

function getInfo(file: string): Promise<AudibleInfo> {

    return new Promise((resolve, reject) => {
        exec('ffmpeg -i ' + '"' + file + '"', (error, stdout, stderr) => {


            const res: AudibleInfo = {
                chapters: getChapters(stderr),
                author: getAuthor(stderr),
                title: getTitle(stderr),
            }

            resolve(res);
        });
    })


}

async function encode(file: string) {
    const info = await getInfo(file);
    const cliProgress = require('cli-progress');
    const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

    bar1.start(info.chapters.length, 0);

    let i = 0;

    for (let chapter of info.chapters) {
        await encodeChapter(file, info, chapter);
        bar1.update(++i);
    }


}

function encodeChapter(fileIn: string, info: AudibleInfo, chapter: AudibleChapter): Promise<string> {

    return new Promise((resolve, reject) => {
        const dirOut = path.dirname("encoded");
        const outDir = path.join("encoded", info.author, info.title)
        // console.log(outDir)
        // mkDirByPathSync(path.resolve(dirOut, '..'));
        mkDirByPathSync(outDir);
        // return;

        // prepare ffmpeg command
        const command = ['ffmpeg',
            '-y',
            '-activation_bytes', '0e4a8109',
            '-i', '"' + fileIn + '"',
            '-ab', '128k',
            '-threads', '4',
            '-ss', chapter.start,
            '-to', chapter.end,
            '-vn',
            '"' + outDir + "\\" + chapter.name.replace(":", "") + '.mp3"'];
        exec(command.join(' '), (error, stdout, stderr) => {

            return resolve(stdout)
            // console.log(error);
            // console.log(stderr);
        });
    })


}

program.parse(process.argv);

const options = program.opts();

if (options.input) {
    encode(options.input);
}
