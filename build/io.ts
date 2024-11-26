import type { PathLike } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export async function readDirDirectories(path: PathLike) {
	const dirents = await readdir(path, { withFileTypes: true });
	return dirents.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
}

export async function readDirFiles(path: PathLike) {
	const dirents = await readdir(path, { withFileTypes: true });
	return dirents.filter((dirent) => dirent.isFile()).map((dirent) => dirent.name);
}

export async function removeDir(path: PathLike) {
	try {
		await rm(path, { recursive: true });
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}

export async function createDir(path: PathLike) {
	try {
		await mkdir(path, { recursive: true });
		return true;
	} catch (error) {
		if (error.code === "EEXIST") return false;
		throw error;
	}
}

export async function readJSON(path: PathLike) {
	const text = await readFile(path, { encoding: "utf-8" });
	return JSON.parse(text);
}

export async function writeJSON(path: PathLike, data: unknown) {
	await createDir(dirname(pathLikeToString(path)));
	const text = JSON.stringify(data);
	return await writeFile(path, text);
}

export function pathLikeToString(pathLike: PathLike): string {
	if (typeof pathLike === "string") return pathLike;
	if (Buffer.isBuffer(pathLike)) return pathLike.toString();
	if (pathLike instanceof URL) return fileURLToPath(pathLike);
	throw new TypeError("Invalid PathLike");
}
