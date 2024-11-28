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
import { version } from "../package.json";

const parseKeywords = (path: string | URL) => readJSON(path);

const parseCallables = async (path: string | URL) => {
	let size = 0;

	const mapDirectories = async (
		path: string | URL,
		transformChild: (path: URL) => unknown | Promise<unknown>,
	) => {
		const dirs = await readDirDirectories(path);
		return Object.fromEntries(
			await Promise.all(
				dirs.map(async (dir) => [dir, await transformChild(new URL(`./${dir}/`, path))]),
			),
		);
	};

	const mapFiles = async (
		path: string | URL,
		transformChild: (path: URL) => unknown | Promise<unknown>,
	) => {
		const files = await readDirFiles(path);
		size += files.length;
		return Object.fromEntries(
			await Promise.all(
				files.map(async (file) => [
					basename(file, extname(file)),
					await transformChild(new URL(`./${file}`, path)),
				]),
			),
		);
	};

	const featuresets = await mapDirectories(path, async (featuresetPath) => ({
		meta: await readJSON(new URL("./meta.json", featuresetPath)),
		modules: await mapDirectories(featuresetPath, async (modulePath) => ({
			callables: await mapFiles(modulePath, readJSON),
		})),
	}));

	return { size, featuresets };
};

const createIndex = async (engines: string[]) => {
	return {
		version,
		engines: Object.fromEntries(
			await Promise.all(
				engines.map(async (engine) => {
					const engineBasePath = new URL(`./${engine}/`, args.base);
					return [
						engine,
						{
							meta: await readJSON(new URL(`./${engine}/meta.json`, srcPath)),
							keyword: new URL("./keyword.json", engineBasePath).href,
							callable: new URL("./callable.json", engineBasePath).href,
						},
					];
				}),
			),
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
if (removedOut) console.log("Removed existing out directory.\n");

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
			const callables = await parseCallables(new URL(`./${engine}/callable/`, srcPath));
			log("Transformed", callables.size, "callables.");
			const callablesOutPath = new URL(`./${engine}/callable.json`, outPath);
			await writeJSON(callablesOutPath, callables);
			log(`Wrote callables to '${pathLikeToString(callablesOutPath)}'.`);
		};

		return await Promise.all([transformKeywords(), transformCallables()]);
	}),
);

const indexOutPath = new URL("./index.json", outPath);
await writeJSON(indexOutPath, await createIndex(engines));
console.log(`Wrote index to '${pathLikeToString(new URL("./index.json", outPath))}'.`);

console.log("\nBuild successful.");
