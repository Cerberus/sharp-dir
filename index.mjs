import { readdir } from 'node:fs/promises'
import sharp from 'sharp'
import { execSync } from 'child_process'

const scanDir = '../'
const directs = await readdir(scanDir, {
	recursive: true,
	withFileTypes: true,
})
const files = directs.filter(
	(direct) =>
		direct.isFile() &&
		['png', 'jpg', 'jpeg'].some((ext) =>
			direct.name.toLowerCase().endsWith(ext),
		),
)

sharp.cache(false)

const outputDirIdx = {}
await files
	.reduce(async (acc, file) => {
		await acc
		const parentDir = file.parentPath ?? '.'
		const fileName = file.name.replace('._', '')
		const filePath = `${parentDir}/${fileName}`

		const outputName = 'output'
		execSync(`mkdir -p "${parentDir}/${outputName}"`)
		outputDirIdx[`${parentDir}/${outputName}`] = true

		console.info('exec', filePath)
		return sharp(`./${filePath}`)
			.toFormat('jpg', { lossless: true, mozjpeg: true })
			.toFile(`${file.parentPath ?? '.'}/${outputName}/${fileName}`)
			.then(() => {
				execSync(
					`mv -f "${
						file.parentPath ?? '.'
					}/${outputName}/${fileName}" "${filePath}"`,
				)
				execSync(`mv "${filePath}" "${filePath.replace('.png', '.jpg')}"`)
			})
	}, Promise.resolve())
	.finally(() => {
		Object.keys(outputDirIdx).forEach((outputDir) => {
			console.info('rm', outputDir)
			execSync(`rm -rf "${outputDir}"`)
		})
	})
