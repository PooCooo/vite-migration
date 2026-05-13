import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RES_SRC = readFileSync(
  resolve(__dirname, '../resource/js/common/_loader_res.js'),
  'utf-8'
)
const SHIM_SRC = readFileSync(
  resolve(__dirname, '../resource/js/common/_loader_dev_shim.js'),
  'utf-8'
)

export function setSupportsModule(supports) {
  if (supports) {
    Object.defineProperty(HTMLScriptElement.prototype, 'noModule', {
      configurable: true,
      writable: true,
      value: false
    })
  } else if ('noModule' in HTMLScriptElement.prototype) {
    delete HTMLScriptElement.prototype.noModule
  }
}

export function setupGlobals() {
  window.So = {
    comm: {
      resCDNDomain: 's4.ssl.qhres2.com',
      isajax: false,
      loaderConfig: {},
      monitor: { bv: 'mock-biz-version' }
    },
    lib: { log: vi.fn() }
  }
  window.__performancetime__ = {
    header_server_render_start: 0, header_server_render_end: 0,
    header_client_render_start: 0, header_client_render_end: 0,
    body_server_render_start: 0, body_server_render_end: 0,
    body_client_render_start: 0, body_client_render_end: 0,
    server_render_time_count: 0, engine_request_time_count: 0
  }
  // 桩 XHR：避免 _loader_res.js 末尾 _loader.use('jquery', ...) 触发真实网络请求
  window.XMLHttpRequest = class MockXHR {
    open() {}
    send() {}
    setRequestHeader() {}
    addEventListener() {}
  }
  window.System = { import: vi.fn(() => Promise.resolve({})) }
  window._LOADER_TEST = true
}

export function resetLoader() {
  delete window._loader
  delete window.OB
}

export function loadLoaderRes() {
  new Function('window', RES_SRC)(window)
  // 把 DomU.ready 改为同步，让 use 的分流断言不必等 setTimeout(0)
  window.OB.DomU.ready = (fn) => fn()
}

export function loadDevShim() {
  new Function('window', SHIM_SRC)(window)
}

// 推进 microtask 队列：等 Promise.all/then 链解析完成
export async function tick() {
  await new Promise(r => setTimeout(r, 0))
}
