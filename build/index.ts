import { basename, extname } from "node:path";
import { parseArgs } from "node:util";
import {
	pathLikeToString,
	readDirDirectories,
	readDirFiles,
	readJSON,
	removeDir,
	writeJSON,
} from "./io";

const parseKeywords = (path: string | URL) => readJSON(path);

const parseCallables = async (path: string | URL) => {
	let size = 0;

	const parseFiles = async (path: string | URL) => {
		const files = await readDirFiles(path);
		size += files.length;
		return Object.fromEntries(
			await Promise.all(
				files.map(async (file) => {
					const filePath = new URL(`./${file}`, path);
					return [basename(file, extname(file)), await readJSON(filePath)] as const;
				}),
			),
		);
	};

	const parseDirectoriesRecursive = async (path: string | URL, keys: string[], depth = 0) => {
		if (depth === keys.length) return parseFiles(path);

		const dirs = await readDirDirectories(path);
		return Object.fromEntries(
			await Promise.all(
				dirs.map(async (dir) => {
					const dirPat = new URL(`./${dir}/`, path);
					return [dir, { [keys[depth]]: await parseDirectoriesRecursive(dirPat, keys, depth + 1) }];
				}),
			),
		);
	};

	return {
		callables: {
			featuresets: await parseDirectoriesRecursive(path, ["modules", "callables"]),
		},
		size,
	};
};

const createIndex = (engines: string[]) => {
	return {
		engines: Object.fromEntries(
			engines.map((engine) => {
				const enginePath = new URL(`./${engine}/`, args.base);
				return [
					engine,
					{
						keyword: new URL("./keyword.json", enginePath).href,
						callable: new URL("./callable.json", enginePath).href,
					},
				];
			}),
		),
	};
};

const srcPath = new URL("../src/", import.meta.url);
const outPath = new URL("../out/", import.meta.url);

const args = parseArgs({
	options: {
		base: {
			type: "string",
			default: outPath.href,
		},
	},
	args: process.argv.slice(2),
}).values;

const removedOut = await removeDir(outPath);
if (removedOut) console.log("Removed existing out directory.");

const engines = await readDirDirectories(srcPath);

await Promise.all(
	engines.map(async (engine) => {
		const log = (...args: unknown[]) => console.log(`[${engine}]`, ...args);

		const transformKeywords = async () => {
			const keywords = await parseKeywords(new URL(`./${engine}/keyword.json`, srcPath));
			log("Transformed", keywords.length, "keywords.");
			const keywordsOutPath = new URL(`./${engine}/keyword.json`, outPath);
			await writeJSON(keywordsOutPath, keywords);
			log(`Wrote keywords to '${pathLikeToString(keywordsOutPath)}'.`);
		};

		const transformCallables = async () => {
			const { callables, size } = await parseCallables(new URL(`./${engine}/callable/`, srcPath));
			log("Transformed", size, "callables.");
			const callablesOutPath = new URL(`./${engine}/callable.json`, outPath);
			await writeJSON(callablesOutPath, callables);
			log(`Wrote callables to '${pathLikeToString(callablesOutPath)}'.`);
		};

		return await Promise.all([transformKeywords(), transformCallables()]);
	}),
);

const indexOutPath = new URL("./index.json", outPath);
await writeJSON(indexOutPath, createIndex(engines));
console.log(`Wrote index to '${pathLikeToString(new URL("./index.json", outPath))}'.`);

console.log("Build successful.");
