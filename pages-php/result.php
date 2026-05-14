<?php require_once __DIR__ . '/../lib/manifest.php'; ?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Mock Result Page</title>
  <script>
    window.So = {
      comm: {
        resCDNDomain: 's4.ssl.qhres2.com',
        isajax: false,
        loaderConfig: {},
        monitor: { bv: 'mock-biz-version' }
      },
      lib: {
        log: function(type, data) {
          console.log('[So.lib.log]', type, data);
        }
      }
    };
    window.__performancetime__ = {
      header_server_render_start: 0, header_server_render_end: 0,
      header_client_render_start: 0, header_client_render_end: 0,
      body_server_render_start: 0,   body_server_render_end: 0,
      body_client_render_start: 0,   body_client_render_end: 0,
      server_render_time_count: 0,   engine_request_time_count: 0,
    };
  </script>

  <!-- 调试钩子：现代浏览器 ?forceLegacy=1 时同步注入 polyfills-legacy，强制走 legacy 分支 -->
  <script>
    if (/[?&]forceLegacy=1\b/.test(location.search)) {
      document.write('<script src="../resource/js/dist-vite/polyfills-legacy.js"><\/script>');
    }
  </script>

  <!-- 静态加载：legacy 浏览器走 polyfills-legacy（含 SystemJS + core-js），现代浏览器自动忽略 nomodule -->
  <script nomodule src="../resource/js/dist-vite/polyfills-legacy.js"></script>

  <!-- 静态加载：_loader_res（dev/prod 通用） -->
  <script src="../resource/js/common/_loader_res.js"></script>

  <!-- Prod mock：PHP 根据 Vite manifest 注入 CSS link -->
  <?php echo render_css_links(['dev/result/ai-searchbox/index.js']); ?>


  <!-- Dev-only：htmlInjector 在此注入 _loader_dev_shim；prod 下保持空 -->
  <!--LOADER-->
</head>
<body>
  <h1>Mock 结果页（模拟 PHP 模板）</h1>

  <!-- ai-searchbox 模块挂载点 -->
  <div id="result-ai-searchbox"></div>

  <script>
    _loader.add('result-ai-searchbox', '../resource/js/dist-vite/result/ai-searchbox.js');

    _loader.use('result-ai-searchbox', function() {
      console.log('[loader] result-ai-searchbox loaded');
    });
  </script>
</body>
</html>
