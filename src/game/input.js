import * as THREE from 'three';

const KEY_ACTIONS = {
  Space: 'shoot',
  KeyK: 'pass',
  KeyJ: 'skill',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
};

export class Input {
  constructor({ onPause, onGesture } = {}) {
    this.onPause = onPause;
    this.onGesture = onGesture;
    this.keys = new Set();
    this.down = new Map();
    this.pressed = new Set();
    this.released = new Set();
    this.stick = new THREE.Vector2();
    this.stickActive = false;
    this.touchButtons = new Map();
    this.gamepad = null;
    this.gamepadPrev = {};
    this.gestureSent = false;

    this._bindKeyboard();
    this._bindTouch();

    window.addEventListener('gamepadconnected', (e) => { this.gamepad = e.gamepad; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepad = null; });
  }

  _gesture() {
    if (!this.gestureSent) {
      this.gestureSent = true;
      this.onGesture?.();
    }
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const gameKey = KEY_ACTIONS[e.code] || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'KeyP', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code);
      if (gameKey) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPause?.();
        return;
      }
      this._gesture();
      this.keys.add(e.code);
      const action = KEY_ACTIONS[e.code];
      if (action) this._setDown(action, `key:${e.code}`);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const action = KEY_ACTIONS[e.code];
      if (action) this._setUp(action, `key:${e.code}`);
    });

    window.addEventListener('blur', () => {
      for (const action of this.down.keys()) {
        for (const source of [...this.down.get(action)]) this._setUp(action, source);
      }
      this.keys.clear();
    });
  }

  _bindTouch() {
    const buttons = document.querySelectorAll('.tbtn[data-action]');
    buttons.forEach((btn) => {
      const action = btn.dataset.action;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._gesture();
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('is-down');
        this.touchButtons.set(e.pointerId, { action, btn });
        this._setDown(action, `touch:${e.pointerId}`);
      });
      const release = (e) => {
        const entry = this.touchButtons.get(e.pointerId);
        if (!entry) return;
        e.preventDefault();
        btn.classList.remove('is-down');
        this.touchButtons.delete(e.pointerId);
        this._setUp(entry.action, `touch:${e.pointerId}`);
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', (e) => {
        const entry = this.touchButtons.get(e.pointerId);
        if (entry) {
          btn.classList.remove('is-down');
          this.touchButtons.delete(e.pointerId);
          this._setUp(entry.action, `touch:${e.pointerId}`);
        }
      });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    const zone = document.getElementById('stickBase');
    if (!zone) return;
    const knob = document.getElementById('stickKnob');
    let pointerId = null;
    let cx = 0;
    let cy = 0;

    const setStick = (clientX, clientY) => {
      const rect = zone.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      const radius = rect.width * 0.36;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      this.stick.set(dx / radius, -dy / radius);
      const dead = 0.12;
      if (Math.abs(this.stick.x) < dead) this.stick.x = 0;
      if (Math.abs(this.stick.y) < dead) this.stick.y = 0;
      const mag = Math.hypot(this.stick.x, this.stick.y);
      if (mag > 1) this.stick.multiplyScalar(1 / mag);
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const reset = () => {
      pointerId = null;
      this.stickActive = false;
      this.stick.set(0, 0);
      if (knob) knob.style.transform = 'translate(0px, 0px)';
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._gesture();
      pointerId = e.pointerId;
      this.stickActive = true;
      zone.setPointerCapture?.(e.pointerId);
      setStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      setStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      reset();
    });
    zone.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== pointerId) return;
      reset();
    });
    zone.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === pointerId) reset();
    });
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
  }

  _setDown(action, source) {
    if (!this.down.has(action)) this.down.set(action, new Set());
    const set = this.down.get(action);
    if (set.has(source)) return;
    set.add(source);
    if (set.size === 1) this.pressed.add(action);
  }

  _setUp(action, source) {
    const set = this.down.get(action);
    if (!set || !set.has(source)) return;
    set.delete(source);
    if (set.size === 0) this.released.add(action);
  }

  poll() {
    // gamepad support
    if (!this.gamepad) {
      const pads = navigator.getGamepads?.();
      this.gamepad = pads ? [...pads].find(Boolean) : null;
    }
    if (!this.gamepad) return;
    const pad = this.gamepad;
    const map = { 0: 'shoot', 1: 'pass', 2: 'skill', 5: 'sprint', 7: 'sprint' };
    for (const [index, action] of Object.entries(map)) {
      const btn = pad.buttons[Number(index)];
      const active = !!btn && (btn.pressed || btn.value > 0.4);
      const key = `pad:${index}`;
      if (active && !this.gamepadPrev[key]) {
        this._gesture();
        this._setDown(action, key);
      } else if (!active && this.gamepadPrev[key]) {
        this._setUp(action, key);
      }
      this.gamepadPrev[key] = active;
    }
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    if (Math.hypot(ax, ay) > 0.18 && !this.stickActive) {
      this.stick.set(ax, -ay);
    }
  }

  isDown(action) {
    const set = this.down.get(action);
    return !!set && set.size > 0;
  }

  wasPressed(action) {
    return this.pressed.has(action);
  }

  wasReleased(action) {
    return this.released.has(action);
  }

  moveAxes() {
    let x = this.stick.x;
    let y = this.stick.y;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}
