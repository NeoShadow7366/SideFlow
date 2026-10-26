(function () {
  const params = new URLSearchParams(window.location.search);
  let displayId = Number(params.get('displayId') || '0');
  let edge = params.get('edge') === 'left' ? 'left' : 'right';
  let isDictating = params.get('dictating') === '1';
  let shortcutLabel = params.get('shortcut') || 'Alt + Space';
  let displayName = params.get('displayName') || '';
  let isOpenElsewhere = params.get('openElsewhere') === '1';

  const wrap = document.getElementById('wrap');
  const btn = document.getElementById('companion-edge-tab');
  const chevronPath = document.getElementById('chevron-path');

  function render() {
    if (!wrap || !btn || !chevronPath) return;
    wrap.className = 'edge-wrap ' + (edge === 'left' ? 'edge-left' : 'edge-right');
    btn.className = 'edge-btn' + (isDictating ? ' dictating' : '');
    chevronPath.setAttribute(
      'd',
      edge === 'left' ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'
    );
    const screenSuffix = displayName ? ' \u2014 ' + displayName : '';
    const actionPrefix = isOpenElsewhere
      ? 'Move SideFlow Here'
      : 'Open SideFlow Panel';
    const label = isDictating
      ? 'Voice Dictation Active \u2014 ' +
        actionPrefix +
        screenSuffix +
        ' (' +
        shortcutLabel +
        ')'
      : actionPrefix + screenSuffix + ' (' + shortcutLabel + ')';
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', label);
  }

  render();

  if (btn) {
    btn.addEventListener('mouseenter', function () {
      if (window.sideflow && window.sideflow.setCompanionIgnoreMouse) {
        window.sideflow.setCompanionIgnoreMouse(displayId, false);
      }
    });

    btn.addEventListener('mouseleave', function () {
      if (window.sideflow && window.sideflow.setCompanionIgnoreMouse) {
        window.sideflow.setCompanionIgnoreMouse(displayId, true);
      }
    });

    btn.addEventListener('mousedown', function () {
      if (window.sideflow && window.sideflow.prepareEdgeTabClick) {
        window.sideflow.prepareEdgeTabClick();
      }
    });

    btn.addEventListener('click', function () {
      if (window.sideflow && window.sideflow.clickEdgeTab) {
        window.sideflow.clickEdgeTab(displayId);
      }
    });
  }

  if (window.sideflow && window.sideflow.onEdgeTabUpdate) {
    window.sideflow.onEdgeTabUpdate(function (payload) {
      if (!payload) return;
      if (typeof payload.displayId === 'number') displayId = payload.displayId;
      if (payload.edge === 'left' || payload.edge === 'right') edge = payload.edge;
      if (typeof payload.isDictating === 'boolean') {
        isDictating = payload.isDictating;
      }
      if (typeof payload.shortcutLabel === 'string' && payload.shortcutLabel) {
        shortcutLabel = payload.shortcutLabel;
      }
      if (typeof payload.displayName === 'string') {
        displayName = payload.displayName;
      }
      if (typeof payload.isOpenElsewhere === 'boolean') {
        isOpenElsewhere = payload.isOpenElsewhere;
      }
      render();
    });
  }
})();
