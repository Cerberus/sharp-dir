//    "sharp": "0.34.4"
import { readdir, stat, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'

const SCAN_DIR = '../'
const MAX_SIDE = 6000 // longest edge in px; lower (e.g. 1920) for smaller/faster files
const QUALITY = 80 // 75-85 is the sweet spot for mozjpeg
const CONCURRENCY = Math.max(1, Math.min(4, os.cpus().length - 1))

sharp.cache(false)

const exists = (p) =>
	stat(p).then(
		() => true,
		() => false,
	)

async function convert(file) {
	const src = path.join(file.parentPath ?? file.path, file.name)
	const dest = src.replace(/\.(png|jpe?g)$/i, '.jpg')
	const tmp = `${dest}.tmp.jpg`
	const isJpegSrc = /\.jpe?g$/i.test(src)

	// e.g. a.png and a.jpg both exist -> don't clobber
	if (dest !== src && (await exists(dest))) {
		console.warn('skip (target exists)', src)
		return null
	}

	const before = (await stat(src)).size

	await sharp(src)
		.rotate() // apply EXIF orientation, since metadata gets stripped
		.resize({
			width: MAX_SIDE,
			height: MAX_SIDE,
			fit: 'inside',
			withoutEnlargement: true,
		})
		.flatten({ background: '#ffffff' }) // transparent PNG -> white, not black
		.toColourspace('srgb')
		.jpeg({
			quality: QUALITY,
			mozjpeg: true, // trellis quant, optimized scans, progressive
			// chromaSubsampling '4:2:0' is the default and what you want for size
		})
		.toFile(tmp)

	const after = (await stat(tmp)).size

	// Re-encoding an existing JPEG can make it bigger: keep the original then
	if (isJpegSrc && after >= before) {
		await rm(tmp)
		console.info('keep', src, `(${before} -> ${after}, not smaller)`)
		return { before, after: before }
	}

	await rename(tmp, dest) // atomic replace for same-name .jpg
	if (dest !== src) await rm(src) // remove the original png/jpeg
	console.info('done', dest, `${(before / 1024) | 0}KB -> ${(after / 1024) | 0}KB`)
	return { before, after }
}

const entries = await readdir(SCAN_DIR, { recursive: true, withFileTypes: true })
const files = entries.filter(
	(e) =>
		e.isFile() &&
		!e.name.startsWith('._') && // macOS resource-fork junk, not real images
		/\.(png|jpe?g)$/i.test(e.name),
)

// simple worker pool
let totalBefore = 0
let totalAfter = 0
const queue = [...files]
await Promise.all(
	Array.from({ length: CONCURRENCY }, async () => {
		while (queue.length) {
			const file = queue.shift()
			try {
				const r = await convert(file)
				if (r) {
					totalBefore += r.before
					totalAfter += r.after
				}
			} catch (err) {
				console.error('fail', file.name, err.message)
			}
		}
	}),
)

console.info(
	`total ${(totalBefore / 1048576).toFixed(1)}MB -> ${(totalAfter / 1048576).toFixed(1)}MB`,
)