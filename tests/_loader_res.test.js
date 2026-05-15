import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  setupGlobals, setSupportsModule, loadLoaderRes, resetLoader
} from './helpers.js'

describe('_loader_res.js', () => {
  beforeEach(() => {
    resetLoader()
    setupGlobals()
    setSupportsModule(true)
    loadLoaderRes()
  })

  describe('add', () => {
    it('dist URL 按普通脚本模块注册，交给原 loader 加载', () => {
      window._loader.add('home-searchbox', '/resource/js/dist/home/searchbox.js')

      expect(window._loader.__test__.modules['home-searchbox']).toEqual({
        url: '/resource/js/dist/home/searchbox.js',
        checker: undefined,
        attrs: undefined
      })
    })

    it('STC 改写后的 CDN URL 仍按普通脚本模块注册', () => {
      const cdnUrl = 'https://ss5.360tres.com/ssl/3531e8db14bb028f/dist/home/searchbox.js'
      window._loader.add('home-searchbox', cdnUrl)

      expect(window._loader.__test__.modules['home-searchbox'].url).toBe(cdnUrl)
    })

    it('默认全局 Vue 模块仍保留在 modules 表中', () => {
      expect(window._loader.__test__.modules['vue3.3.9']).toBeDefined()
      expect(window._loader.__test__.modules['vue3.3.9'].checker()).toBe(false)

      window.Vue = {}
      expect(window._loader.__test__.modules['vue3.3.9'].checker()).toBe(true)
    })
  })

  describe('use', () => {
    it('已就绪模块按原 loader 流程触发 callback', () => {
      window._loader.add('ready-biz', '/resource/js/dist/home/searchbox.js', () => true)
      const cb = vi.fn()

      window._loader.use('ready-biz', cb)

      expect(cb).toHaveBeenCalled()
    })

    it('Vue external + 业务 IIFE 的依赖顺序仍由 _loader.use 表达', () => {
      window.Vue = {}
      window._loader.add('home-searchbox', '/resource/js/dist/home/searchbox.js', () => true)
      const cb = vi.fn()

      window._loader.use('vue3.3.9,home-searchbox', cb)

      expect(cb).toHaveBeenCalled()
    })
  })
})
