import { basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

import { readDirDirectories, readDirFiles, removeDir, readJSON, writeJSON } from "./io";

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

const srcPath = new URL("../src/", import.meta.url);
const outPath = new URL("../out/", import.meta.url);

const removedOut = await removeDir(outPath);
if (removedOut) console.log("Removed existing out directory.");

const engines = await readDirDirectories(srcPath);

await Promise.all(
	engines.map(async (engine) => {
		const log = (...args: unknown[]) => console.log(`[${engine}]`, ...args);
		const transformKeywords = async () => {
			const keywords = await parseKeywords(new URL(`./${engine}/keyword.json`, srcPath));
			log("Transformed", keywords.length, "keywords.");
			await writeJSON(new URL(`./${engine}/keyword.json`, outPath), keywords);
			log(`Wrote keywords to '${fileURLToPath(outPath)}'.`);
		};
		const transformCallables = async () => {
			const { callables, size } = await parseCallables(new URL(`./${engine}/callable/`, srcPath));
			log("Transformed", size, "callables.");
			await writeJSON(new URL(`./${engine}/callable.json`, outPath), callables);
			log(`Wrote callables to '${fileURLToPath(outPath)}'.`);
		};

		return await Promise.all([transformKeywords(), transformCallables()]);
	}),
);
console.log("Build successful.");
