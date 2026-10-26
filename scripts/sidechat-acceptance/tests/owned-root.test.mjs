import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setupRoot } from '../scripts/run-sidechat-acceptance.mjs'

test('owned roots use the same real path as the official workspace registry', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'dsh354-root-contract-'))
  const target = join(parent, 'target'), alias = join(parent, 'alias')
  const previous = process.env.TMPDIR
  const cleanup = []
  try {
    await mkdir(target)
    await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
    process.env.TMPDIR = alias
    const { root, env } = await setupRoot(dispose => cleanup.push(dispose))
    assert.equal(root, await realpath(root))
    assert.ok(root.startsWith(await realpath(target) + '/'))
    assert.equal(env.DSH_HOME, join(root, 'home'))
  } finally {
    if (previous === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previous
    for (const dispose of cleanup.reverse()) await dispose()
    await rm(parent, { recursive: true, force: true })
  }
})
