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

  <!-- 静态加载：_loader_res（dev/prod 通用） -->
  <script src="../resource/js/common/_loader_res.js"></script>

<?php if (is_dev()): ?>
  <!-- Dev：接入 Vite HMR（双 server：PHP :8000 + Vite :5173） -->
  <script type="module" src="<?php echo dev_origin(); ?>/@vite/client"></script>
  <script src="<?php echo dev_origin(); ?>/resource/js/common/_loader_dev_shim.js"></script>
<?php else: ?>
  <!-- Prod：当前 IIFE 构建把 Vue SFC CSS 注入 JS；若后续抽 CSS，必须写成 /resource/... 字面量交给 STC -->
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
    _loader.add('result-ai-searchbox', { stc: '/resource/js/dist/result/ai-searchbox.js' }.stc);
<?php endif; ?>

    _loader.use('vue3.3.9,result-ai-searchbox', function() {
      console.log('[loader] result-ai-searchbox loaded');
    });
  </script>
</body>
</html>
