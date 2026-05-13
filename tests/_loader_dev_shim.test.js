import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  setupGlobals, setSupportsModule, loadLoaderRes, loadDevShim, resetLoader, tick
} from './helpers.js'

describe('_loader_dev_shim.js', () => {
  let mockDevImport

  beforeEach(() => {
    resetLoader()
    setupGlobals()
    setSupportsModule(true)
    loadLoaderRes()
    loadDevShim()
    mockDevImport = vi.fn(() => Promise.resolve({}))
    window._loader.__test_dev__.dynamicImport = mockDevImport
  })

  describe('add', () => {
    it('dist/ URL 反推到 /dev/<area>/<name>/index.js', () => {
      window._loader.add('home-searchbox', '../resource/js/dist/home/searchbox.js')
      expect(window._loader.__test_dev__.devUrlMap['home-searchbox'])
        .toBe('/dev/home/searchbox/index.js')
    })

    it('dist-vite/ URL 也反推到同样的 dev 路径', () => {
      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      expect(window._loader.__test_dev__.devUrlMap['home-searchbox'])
        .toBe('/dev/home/searchbox/index.js')
    })

    it('homeAI 特例：homeAI/<*>.js → /dev/homeAI/main.js', () => {
      window._loader.add('home-ai', '/resource/js/dist-vite/homeAI/homeAI.js')
      expect(window._loader.__test_dev__.devUrlMap['home-ai'])
        .toBe('/dev/homeAI/main.js')
    })

    it('兼容 url 对象形态 { stc: ... }', () => {
      window._loader.add('home-searchbox', { stc: '/resource/js/dist-vite/home/searchbox.js' })
      expect(window._loader.__test_dev__.devUrlMap['home-searchbox'])
        .toBe('/dev/home/searchbox/index.js')
    })

    it('非业务 URL 不写入 devUrlMap，但 modules 表仍由原 add 注册', () => {
      window._loader.add('foo', 'https://cdn.example.com/foo.js')
      expect(window._loader.__test_dev__.devUrlMap['foo']).toBeUndefined()
      expect(window._loader.__test__.modules['foo']).toBeDefined()
    })
  })

  describe('use', () => {
    it('业务模块走 dynamic import → /dev/.../index.js', async () => {
      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      const cb = vi.fn()
      window._loader.use('home-searchbox', cb)
      await tick()
      expect(mockDevImport).toHaveBeenCalledWith('/dev/home/searchbox/index.js')
      expect(cb).toHaveBeenCalled()
    })

    it('库模块交还原 _loader.use 处理（dev shim 不动它）', async () => {
      window._loader.add('mylib', 'https://cdn.example.com/mylib.js')
      // 标记 mylib 已就绪，让原 use 直接触发 callback
      window._loader.__test__.modules['mylib'].checker = () => true

      const cb = vi.fn()
      window._loader.use('mylib', cb)
      await tick()
      expect(mockDevImport).not.toHaveBeenCalled()
      expect(cb).toHaveBeenCalled()
    })

    it('混合 biz + lib：lib 先就绪后再加载 biz', async () => {
      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      window._loader.add('mylib', 'https://cdn.example.com/mylib.js')
      window._loader.__test__.modules['mylib'].checker = () => true

      const cb = vi.fn()
      window._loader.use('mylib, home-searchbox', cb)
      await tick()
      expect(mockDevImport).toHaveBeenCalledWith('/dev/home/searchbox/index.js')
      expect(cb).toHaveBeenCalled()
    })

    it('shim 完全覆盖原 use：_loader_res 的能力检测分支在 dev 不会触发', async () => {
      // 同时为 _loader_res 的 dynamicImport 装 mock，验证它从未被调用
      const mockResImport = vi.fn(() => Promise.resolve({}))
      window._loader.__test__.dynamicImport = mockResImport

      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      const cb = vi.fn()
      window._loader.use('home-searchbox', cb)
      await tick()

      // dev shim 的 import 被调用
      expect(mockDevImport).toHaveBeenCalled()
      // _loader_res 的 import / System.import 都未被调用
      expect(mockResImport).not.toHaveBeenCalled()
      expect(window.System.import).not.toHaveBeenCalled()
    })
  })
})
