// 在 _loader_res.js 之后加载，拦截并覆盖 add 和 use 方法
(function () {
  if (!window._loader) return;

  // 显式覆盖表（极少数边界情况用，默认走规则反推）
  var overrides = {
    // 'homeAI': '/dev/homeAI/main.js'
  };

  function distUrlToDevUrl(url) {
    if (!url) return null;
    // 匹配 resource/js/dist/<area>/<name>.js 或 resource/js/dist-vite/<area>/<name>.js（兼容相对/绝对路径）
    var m = url.match(/resource\/js\/dist(?:-vite)?\/([^\/]+)\/([^\/]+)\.js$/);
    if (!m) return null;
    var area = m[1], name = m[2];

    // 特例处理
    if (area === 'homeAI') return '/dev/homeAI/main.js';

    return '/dev/' + area + '/' + name + '/index.js';
  }

  // 内部模块名 → dev 路径（add 时注册）
  var devUrlMap = {};

  // 1. 拦截 add，建立 name 到 devUrl 的映射
  var origAdd = window._loader.add;
  window._loader.add = function (name, url) {
    // 兼容原项目中 url 可能传字符串，也可能传对象 { stc: '...' } 的情况
    var resolvedUrl = typeof url === 'string' ? url : (url && url.stc) || '';
    var devUrl = overrides[name] || distUrlToDevUrl(resolvedUrl);

    if (devUrl) {
      devUrlMap[name] = devUrl;
    }

    // 依然调用原 add，保留老 _loader 的内部状态
    return origAdd.apply(this, arguments);
  };

  // 2. 拦截 use，实现分流
  var origUse = window._loader.use;
  window._loader.use = function (names, callback) {
    var list = names.split(/\s*,\s*/g);

    // 过滤：在 devUrlMap 中的属于业务模块，不在的属于全局库（如 jquery）
    var bizNames = list.filter(function (n) { return devUrlMap[n]; });
    var libNames = list.filter(function (n) { return !devUrlMap[n]; });

    // 使用 new Function 隐藏动态 import，防止 Vite 静态分析注入 /@vite/client 导致普通 script 报错
    var dynamicImport = new Function('url', 'return import(url)');

    function loadBiz() {
      // 业务依赖走 Vite 的原生动态导入
      return Promise.all(bizNames.map(function (n) {
        return dynamicImport(devUrlMap[n]);
      }));
    }

    if (libNames.length === 0) {
      // 全是业务模块，直接走 Vite 加载
      loadBiz().then(callback);
    } else {
      // 库依赖仍走原 _loader，加载完毕后再由 Vite 加载业务模块
      origUse.call(window._loader, libNames.join(','), function () {
        loadBiz().then(callback);
      });
    }
  };
})();
