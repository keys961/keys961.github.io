/*!
 * Site helper scripts for keys961.github.io
 * Centralized navigation, catalog, and async-loading behavior.
 */
;(function () {
  'use strict';

  var siteConfig = window.siteConfig || {};
  var baseurl = siteConfig.baseurl || '';

  function asyncLoadScript(src, callback) {
    var d = document;
    var script = d.createElement('script');
    script.src = src;
    script.async = true;
    if (typeof callback === 'function') {
      script.addEventListener('load', function (event) { callback(null, event); }, false);
      script.addEventListener('error', function (event) { callback(new Error('Failed to load ' + src), event); }, false);
    }
    var firstScript = d.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  }

  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  function initNavbar() {
    var toggle = document.querySelector('.navbar-toggle');
    var navbar = document.querySelector('#huxblog_navbar');
    var collapse = document.querySelector('.navbar-collapse');

    if (!toggle || !navbar || !collapse) { return; }

    function closeNavigation() {
      navbar.classList.remove('in');
      setTimeout(function () {
        if (!navbar.classList.contains('in')) {
          collapse.style.height = '0px';
        }
      }, 400);
    }

    function openNavigation() {
      collapse.style.height = 'auto';
      navbar.classList.add('in');
    }

    toggle.addEventListener('click', function () {
      if (navbar.classList.contains('in')) {
        closeNavigation();
      } else {
        openNavigation();
      }
    });

    document.addEventListener('click', function (event) {
      if (event.target === toggle || event.target.classList.contains('icon-bar')) {
        return;
      }
      closeNavigation();
    });
  }

  function initTagCloud() {
    if (!document.getElementById('tag_cloud') || !window.$) { return; }

    asyncLoadScript(baseurl + '/js/jquery.tagcloud.js', function (err) {
      if (err || !window.$ || !window.$.fn || !window.$.fn.tagcloud) { return; }
      window.$.fn.tagcloud.defaults = {
        color: { start: '#bbbbee', end: '#0085a1' }
      };
      window.$('#tag_cloud a').tagcloud();
    });
  }

  function initResponsiveTables() {
    var tables = document.querySelectorAll('article table');
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      var wrapper = document.createElement('div');
      wrapper.className = 'table-responsive';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
      table.classList.add('table');
    }
  }

  function initResponsiveEmbeds() {
    var selectors = [
      'iframe[src*="youtube.com"]',
      'iframe[src*="vimeo.com"]'
    ];

    for (var s = 0; s < selectors.length; s++) {
      var embeds = document.querySelectorAll(selectors[s]);
      for (var j = 0; j < embeds.length; j++) {
        var iframe = embeds[j];
        var wrapper = document.createElement('div');
        wrapper.className = 'embed-responsive embed-responsive-16by9';
        iframe.classList.add('embed-responsive-item');
        iframe.parentNode.insertBefore(wrapper, iframe);
        wrapper.appendChild(iframe);
      }
    }
  }

  function initScrollHeader() {
    var MQL = 1170;
    var navbar = document.querySelector('.navbar-custom');
    var header = document.querySelector('.intro-header');
    if (!navbar || !header) { return; }

    var headerHeight = navbar.offsetHeight;
    var bannerContainer = header.querySelector('.container');
    var bannerHeight = bannerContainer ? bannerContainer.offsetHeight : 0;
    var previousTop = 0;

    window.addEventListener('scroll', function () {
      if (window.innerWidth <= MQL) { return; }

      var currentTop = window.pageYOffset || document.documentElement.scrollTop;
      var sideCatalog = document.querySelector('.side-catalog');

      if (currentTop < previousTop) {
        if (currentTop > 0 && navbar.classList.contains('is-fixed')) {
          navbar.classList.add('is-visible');
        } else {
          navbar.classList.remove('is-visible', 'is-fixed');
        }
      } else {
        navbar.classList.remove('is-visible');
        if (currentTop > headerHeight && !navbar.classList.contains('is-fixed')) {
          navbar.classList.add('is-fixed');
        }
      }
      previousTop = currentTop;

      if (sideCatalog) {
        sideCatalog.style.display = 'block';
        if (currentTop > bannerHeight + 41) {
          sideCatalog.classList.add('fixed');
        } else {
          sideCatalog.classList.remove('fixed');
        }
      }
    });
  }

  function generateCatalog(selector) {
    var container = document.querySelector(selector);
    if (!container) { return; }

    var postContainer = document.querySelector('div.post-container');
    if (!postContainer) { return; }

    var headings = postContainer.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      if (!heading.id) { continue; }
      var item = document.createElement('li');
      item.className = heading.tagName.toLowerCase() + '_nav';

      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.rel = 'nofollow';
      link.textContent = heading.textContent;

      item.appendChild(link);
      container.appendChild(item);
    }
  }

  function initCatalog() {
    if (!document.querySelector('.catalog-body')) { return; }
    generateCatalog('.catalog-body');

    asyncLoadScript(baseurl + '/js/jquery.nav.js', function (err) {
      if (err || !window.$ || !window.$.fn || !window.$.fn.onePageNav) { return; }
      window.$('.catalog-body').onePageNav({
        currentClass: 'active',
        changeHash: false,
        easing: 'swing',
        filter: '',
        scrollSpeed: 700,
        scrollOffset: 0,
        scrollThreshold: 0.2,
        begin: null,
        end: null,
        scrollChange: null,
        padding: 80
      });
    });
  }

  function initFastClick() {
    var nav = document.querySelector('nav');
    if (!nav) { return; }

    asyncLoadScript('//cdnjs.cloudflare.com/ajax/libs/fastclick/1.0.6/fastclick.min.js', function (err) {
      if (err || !window.FastClick) { return; }
      window.FastClick.attach(nav);
    });
  }

  function initServiceWorker() {
    if (!siteConfig.serviceWorker || !('serviceWorker' in navigator)) { return; }
    navigator.serviceWorker.register('/sw.js')
      .then(function (registration) { console.log('Service Worker Registered.', registration); })
      .catch(function (error) { console.log('Service Worker registration failed:', error); });
  }

  ready(function () {
    initNavbar();
    initTagCloud();
    initCatalog();
    initResponsiveTables();
    initResponsiveEmbeds();
    initScrollHeader();
    initFastClick();
    initServiceWorker();
  });

  window.asyncLoadScript = asyncLoadScript;
})();
