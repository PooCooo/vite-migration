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

<?php if (!is_dev()): ?>
  <!-- 调试钩子：现代浏览器 ?forceLegacy=1 时同步注入 polyfills-legacy，强制走 legacy 分支 -->
  <script>
    if (/[?&]forceLegacy=1\b/.test(location.search)) {
      document.write('<script src="<?php echo polyfills_legacy_url(); ?>"><\/script>');
    }
  </script>

  <!-- 静态加载：legacy 浏览器走 polyfills-legacy（含 SystemJS + core-js），现代浏览器自动忽略 nomodule -->
  <script nomodule src="<?php echo polyfills_legacy_url(); ?>"></script>
<?php endif; ?>

  <!-- 静态加载：_loader_res（dev/prod 通用） -->
  <script src="../resource/js/common/_loader_res.js"></script>

<?php if (is_dev()): ?>
  <!-- Dev：接入 Vite HMR（双 server：PHP :8000 + Vite :5173） -->
  <script type="module" src="<?php echo dev_origin(); ?>/@vite/client"></script>
  <script src="<?php echo dev_origin(); ?>/resource/js/common/_loader_dev_shim.js"></script>
<?php else: ?>
  <!-- Prod：PHP 根据 Vite manifest 注入 CSS link -->
  <?php echo render_css_links(['dev/result/ai-searchbox/index.js']); ?>
<?php endif; ?>
</head>
<body>
  <h1>Mock 结果页（模拟 PHP 模板）</h1>

  <!-- ai-searchbox 模块挂载点 -->
  <div id="result-ai-searchbox"></div>

  <script>
<?php if (is_dev()): ?>
    _loader.add('result-ai-searchbox', '<?php echo entry_url('dev/result/ai-searchbox/index.js'); ?>');
<?php else: ?>
    _loader.add('result-ai-searchbox', {
      stc:    '<?php echo entry_url('dev/result/ai-searchbox/index.js', 'modern'); ?>',
      legacy: '<?php echo entry_url('dev/result/ai-searchbox/index.js', 'legacy'); ?>'
    });
<?php endif; ?>

    _loader.use('result-ai-searchbox', function() {
      console.log('[loader] result-ai-searchbox loaded');
    });
  </script>
</body>
</html>
