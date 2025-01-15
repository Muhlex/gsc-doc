import { basename, extname } from "node:path";
import { parseArgs } from "node:util";

import {
	pathLikeToString,
	readDirDirectories,
	readDirFiles,
	readJSON,
	removeDir,
	writeJSON,
	removeFileExtension,
} from "./io";

import { version } from "../package.json";

const getDistPath = (path: string | URL) => new URL(path, args.base);

const transformScope = (scope: string) => {
	const [engine, featuresetsString] = scope.split("|");
	if (!featuresetsString) return { engine };
	return { engine, featuresets: featuresetsString.split("-") };
};

const transformEngines = async (path: string | URL) => {
	return Promise.all(
		(await readDirFiles(path)).map(async (filename) => {
			const engineUrl = new URL(`./${filename}`, path);
			return readJSON(engineUrl);
		}),
	);
};

const transformKeywords = async (path: string | URL) => {
	return new Map(
		await Promise.all(
			(await readDirFiles(path)).map(async (filename) => {
				const keywordUrl = new URL(`./${filename}`, path);
				const data = await readJSON(keywordUrl);

				const name = removeFileExtension(filename);
				return [name, { scopes: data.scopes.map(transformScope) }] as const;
			}),
		),
	);
};

const transformCallables = async (path: string | URL) => {
	const callables = new Map<string, any>();
	const promises: Promise<void>[] = [];

	const modules = await readDirDirectories(path);
	for (const module of modules) {
		const modulePath = new URL(`./${module}/`, path);
		const promise = readDirFiles(modulePath).then(async (filenames) => {
			for (const filename of filenames) {
				const callablePath = new URL(`./${filename}`, modulePath);
				const data = await readJSON(callablePath);

				const name = removeFileExtension(filename);
				const value = [
					...data.map((variant: any) => ({
						...variant,
						module,
						scopes: variant.scopes.map(transformScope),
					})),
				];
				callables.set(name, value);
			}
		});
		promises.push(promise);
	}

	await Promise.all(promises);
	return callables;
};

const srcPath = new URL("../src/", import.meta.url);
const outPath = new URL("../dist/", import.meta.url);

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

const engines = await transformEngines(new URL("./engines/", srcPath));

const keywords = await transformKeywords(new URL("./keywords/", srcPath));
console.log("Transformed", keywords.size, "keywords.");

const callables = await transformCallables(new URL("./callables/", srcPath));
console.log("Transformed", callables.size, "callables.");

const enginesOutPath = new URL("./engines.json", outPath);
await writeJSON(enginesOutPath, engines);
console.log(`Wrote engines to '${pathLikeToString(enginesOutPath)}'.`);

const keywordsOutPath = new URL("./keywords.json", outPath);
await writeJSON(keywordsOutPath, Object.fromEntries(keywords));
console.log(`Wrote keywords to '${pathLikeToString(keywordsOutPath)}'.`);

const callablesOutPath = new URL("./callables.json", outPath);
await writeJSON(callablesOutPath, Object.fromEntries(callables));
console.log(`Wrote callables to '${pathLikeToString(callablesOutPath)}'.`);

const indexOutPath = new URL("./index.json", outPath);
await writeJSON(indexOutPath, { version, urls: {
	engines: getDistPath("./engines.json").href,
	keywords: getDistPath("./keywords.json").href,
	callables: getDistPath("./callables.json").href,
} });
console.log(`Wrote index to '${pathLikeToString(indexOutPath)}'.`);

// const engines = await readDirDirectories(srcPath);

// await Promise.all(
// 	engines.map(async (engine) => {
// 		const log = (...args: unknown[]) => console.log(`[${engine}]`, ...args);

// 		const transformKeywords = async () => {
// 			const keywords = await parseKeywords(new URL(`./${engine}/keyword.json`, srcPath));
// 			log("Transformed", keywords.length, "keywords.");
// 			const keywordsOutPath = new URL(`./${engine}/keyword.json`, outPath);
// 			await writeJSON(keywordsOutPath, keywords);
// 			log(`Wrote keywords to '${pathLikeToString(keywordsOutPath)}'.`);
// 		};

// 		const transformCallables = async () => {
// 			const callables = await parseCallables(new URL(`./${engine}/callable/`, srcPath));
// 			log("Transformed", callables.size, "callables.");
// 			const callablesOutPath = new URL(`./${engine}/callable.json`, outPath);
// 			await writeJSON(callablesOutPath, callables);
// 			log(`Wrote callables to '${pathLikeToString(callablesOutPath)}'.`);
// 		};

// 		return await Promise.all([transformKeywords(), transformCallables()]);
// 	}),
// );

// const indexOutPath = new URL("./index.json", outPath);
// await writeJSON(indexOutPath, await createIndex(engines));
// console.log(`Wrote index to '${pathLikeToString(new URL("./index.json", outPath))}'.`);

console.log("\nBuild successful.");
