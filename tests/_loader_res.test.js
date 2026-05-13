import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  setupGlobals, setSupportsModule, loadLoaderRes, resetLoader, tick
} from './helpers.js'

describe('_loader_res.js', () => {
  describe('BIZ_DIST_PATTERN', () => {
    beforeEach(() => {
      resetLoader()
      setupGlobals()
      setSupportsModule(true)
      loadLoaderRes()
    })

    it('识别 dist-vite/ 路径（相对和绝对）', () => {
      const { BIZ_DIST_PATTERN } = window._loader.__test__
      expect(BIZ_DIST_PATTERN.test('../resource/js/dist-vite/home/searchbox.js')).toBe(true)
      expect(BIZ_DIST_PATTERN.test('/resource/js/dist-vite/result/ai-searchbox.js')).toBe(true)
    })

    it('识别 dist/ 路径（Rollup 基线）', () => {
      const { BIZ_DIST_PATTERN } = window._loader.__test__
      expect(BIZ_DIST_PATTERN.test('../resource/js/dist/home/searchbox.js')).toBe(true)
    })

    it('不识别非业务路径', () => {
      const { BIZ_DIST_PATTERN } = window._loader.__test__
      expect(BIZ_DIST_PATTERN.test('https://s0.qhimg.com/lib/jquery/183.js')).toBe(false)
      expect(BIZ_DIST_PATTERN.test('/some/other/path.js')).toBe(false)
    })
  })

  describe('distUrlToLegacy', () => {
    beforeEach(() => {
      resetLoader()
      setupGlobals()
      setSupportsModule(true)
      loadLoaderRes()
    })

    it('.js → -legacy.js', () => {
      const { distUrlToLegacy } = window._loader.__test__
      expect(distUrlToLegacy('/resource/js/dist-vite/home/searchbox.js'))
        .toBe('/resource/js/dist-vite/home/searchbox-legacy.js')
    })

    it('保留 query string', () => {
      const { distUrlToLegacy } = window._loader.__test__
      expect(distUrlToLegacy('/foo/bar.js?t=123'))
        .toBe('/foo/bar-legacy.js?t=123')
    })
  })

  describe('add', () => {
    beforeEach(() => {
      resetLoader()
      setupGlobals()
      setSupportsModule(true)
      loadLoaderRes()
    })

    it('业务 URL 写入 bizModules，包含 modern + legacy', () => {
      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      const { bizModules } = window._loader.__test__
      expect(bizModules['home-searchbox']).toEqual({
        modernUrl: '/resource/js/dist-vite/home/searchbox.js',
        legacyUrl: '/resource/js/dist-vite/home/searchbox-legacy.js'
      })
    })

    it('业务模块不写入 modules 表（原 _loader 不再管理）', () => {
      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      const { modules } = window._loader.__test__
      expect(modules['home-searchbox']).toBeUndefined()
    })

    it('非业务模块继续写入 modules 表（走原 _loader 路径）', () => {
      window._loader.add('foo', 'https://cdn.example.com/foo.js')
      const { bizModules, modules } = window._loader.__test__
      expect(bizModules['foo']).toBeUndefined()
      expect(modules['foo']).toEqual({
        url: 'https://cdn.example.com/foo.js',
        checker: undefined,
        attrs: undefined
      })
    })

    it('兼容 url 对象形态 { stc: ... }', () => {
      window._loader.add('home-searchbox', { stc: '/resource/js/dist-vite/home/searchbox.js' })
      const { bizModules } = window._loader.__test__
      expect(bizModules['home-searchbox']).toBeDefined()
      expect(bizModules['home-searchbox'].modernUrl)
        .toBe('/resource/js/dist-vite/home/searchbox.js')
      expect(bizModules['home-searchbox'].legacyUrl)
        .toBe('/resource/js/dist-vite/home/searchbox-legacy.js')
    })
  })

  describe('use - modern (supportsModule=true)', () => {
    let mockImport
    beforeEach(() => {
      resetLoader()
      setupGlobals()
      setSupportsModule(true)
      loadLoaderRes()
      mockImport = vi.fn(() => Promise.resolve({}))
      window._loader.__test__.dynamicImport = mockImport
    })

    it('能力检测：supportsModule === true', () => {
      expect(window._loader.__test__.supportsModule).toBe(true)
    })

    it('业务模块走 dynamic import，URL 为 modern', async () => {
      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      const cb = vi.fn()
      window._loader.use('home-searchbox', cb)
      await tick()
      expect(mockImport).toHaveBeenCalledWith('/resource/js/dist-vite/home/searchbox.js')
      expect(window.System.import).not.toHaveBeenCalled()
      expect(cb).toHaveBeenCalled()
    })
  })

  describe('use - legacy (supportsModule=false)', () => {
    beforeEach(() => {
      resetLoader()
      setupGlobals()
      setSupportsModule(false)
      loadLoaderRes()
    })

    it('能力检测：supportsModule === false', () => {
      expect(window._loader.__test__.supportsModule).toBe(false)
    })

    it('业务模块走 System.import，URL 为 legacy + 绝对化', async () => {
      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      const cb = vi.fn()
      window._loader.use('home-searchbox', cb)
      await tick()
      const expected = new URL(
        '/resource/js/dist-vite/home/searchbox-legacy.js',
        document.baseURI
      ).href
      expect(window.System.import).toHaveBeenCalledWith(expected)
      expect(cb).toHaveBeenCalled()
    })
  })

  describe('use - 混合 lib + biz', () => {
    let mockImport
    beforeEach(() => {
      resetLoader()
      setupGlobals()
      setSupportsModule(true)
      loadLoaderRes()
      mockImport = vi.fn(() => Promise.resolve({}))
      window._loader.__test__.dynamicImport = mockImport
    })

    it('lib 已就绪：useCallback 触发 biz 加载，callback 最终被调', async () => {
      window._loader.add('home-searchbox', '/resource/js/dist-vite/home/searchbox.js')
      window._loader.add('mylib', 'https://cdn.example.com/mylib.js')
      // 标记 mylib 已就绪：让原 use 的分流逻辑跳过 XHR 直接调 useCallback
      window._loader.__test__.modules['mylib'].checker = () => true

      const cb = vi.fn()
      window._loader.use('mylib, home-searchbox', cb)
      await tick()
      expect(mockImport).toHaveBeenCalledWith('/resource/js/dist-vite/home/searchbox.js')
      expect(cb).toHaveBeenCalled()
    })
  })
})
