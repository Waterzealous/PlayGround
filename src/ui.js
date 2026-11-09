import { PLAYSTYLES } from './game/constants.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ onPlay, onStyleChange, onDifficultyChange, onPauseToggle, onResume, onRestart, onMenu, onAgain, onSoundToggle } = {}) {
    this.onPlay = onPlay;
    this.onStyleChange = onStyleChange;
    this.onDifficultyChange = onDifficultyChange;
    this.onPauseToggle = onPauseToggle;
    this.onResume = onResume;
    this.onRestart = onRestart;
    this.onMenu = onMenu;
    this.onAgain = onAgain;
    this.onSoundToggle = onSoundToggle;

    this.el = {
      menu: $('menu'),
      hud: $('hud'),
      pause: $('pause'),
      end: $('end'),
      play: $('playBtn'),
      pauseBtn: $('pauseBtn'),
      resume: $('resumeBtn'),
      restart: $('restartBtn'),
      menuBtn: $('menuBtn'),
      again: $('againBtn'),
      endMenu: $('endMenuBtn'),
      sound: $('menuSound'),
      styles: $('styles'),
      difficulty: $('difficulty'),
      toast: $('toast'),
      goalFlash: $('goalFlash'),
      goalKicker: $('goalKicker'),
      goalScorer: $('goalScorer'),
      flash: $('flash'),
      clock: $('clock'),
      clockLabel: $('clockLabel'),
      clockWrap: document.querySelector('.clock-wrap'),
      scoreHome: $('scoreHome'),
      scoreAway: $('scoreAway'),
      styleChip: $('styleChip'),
      styleChipText: $('styleChipText'),
      shotsStat: $('shotsStat'),
      posStat: $('posStat'),
      playerName: $('playerName'),
      playerStyle: $('playerStyle'),
      avatar: $('avatar'),
      staminaFill: $('staminaFill'),
      stamina: document.querySelector('.stamina'),
      hintBar: $('hintBar'),
      hintDesktop: $('hintDesktop'),
      chargeMeter: $('chargeMeter'),
      chargeFill: $('chargeFill'),
      chargeNeedle: $('chargeNeedle'),
      shootBtn: document.querySelector('.tbtn-shoot'),
      pauseHome: $('pauseHome'),
      pauseAway: $('pauseAway'),
      endKicker: $('endKicker'),
      endTitle: $('endTitle'),
      endScore: $('endScore'),
      endShots: $('endShots'),
      endPos: $('endPos'),
      endTackles: $('endTackles'),
      endStyle: $('endStyle'),
      stylCards: [...document.querySelectorAll('.style-card')],
      diffBtns: [...document.querySelectorAll('#difficulty button')],
    };

    this.selectedStyle = localStorage.getItem('neon-style') || 'showman';
    this.selectedDifficulty = localStorage.getItem('neon-diff') || 'pro';
    if (!PLAYSTYLES[this.selectedStyle]) this.selectedStyle = 'showman';
    if (!['casual', 'pro', 'legend'].includes(this.selectedDifficulty)) this.selectedDifficulty = 'pro';
    this.toastTimer = null;
    this.goalTimer = null;
    this._bind();
    this._syncMenu();
  }

  _bind() {
    this.el.play.addEventListener('click', () => {
      this.el.play.blur();
      this.onPlay?.(this.selectedStyle, this.selectedDifficulty);
    });
    this.el.pauseBtn.addEventListener('click', () => this.onPauseToggle?.());
    this.el.resume.addEventListener('click', () => this.onResume?.());
    this.el.restart.addEventListener('click', () => this.onRestart?.());
    this.el.menuBtn.addEventListener('click', () => this.onMenu?.());
    this.el.again.addEventListener('click', () => this.onAgain?.());
    this.el.endMenu.addEventListener('click', () => this.onMenu?.());
    this.el.sound.addEventListener('click', () => {
      const muted = this.onSoundToggle?.();
      this.setMuted(muted);
    });

    this.el.stylCards.forEach((card) => {
      card.addEventListener('click', () => {
        this.selectedStyle = card.dataset.style;
        localStorage.setItem('neon-style', this.selectedStyle);
        this._syncMenu();
        this.onStyleChange?.(this.selectedStyle);
      });
    });

    this.el.diffBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedDifficulty = btn.dataset.diff;
        localStorage.setItem('neon-diff', this.selectedDifficulty);
        this._syncMenu();
        this.onDifficultyChange?.(this.selectedDifficulty);
      });
    });

    // click / touch feedback on every control button
    document.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('pointerdown', () => btn.classList.add('is-pressed'), { passive: true });
      btn.addEventListener('pointerup', () => btn.classList.remove('is-pressed'), { passive: true });
      btn.addEventListener('pointerleave', () => btn.classList.remove('is-pressed'), { passive: true });
    });
  }

  _syncMenu() {
    for (const card of this.el.stylCards) {
      const on = card.dataset.style === this.selectedStyle;
      card.classList.toggle('is-selected', on);
      card.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    for (const btn of this.el.diffBtns) {
      const on = btn.dataset.diff === this.selectedDifficulty;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  setMuted(muted) {
    this.el.sound.classList.toggle('is-muted', !!muted);
    this.el.sound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  showMenu() {
    this.el.menu.classList.remove('is-hidden');
    this.el.hud.classList.add('is-hidden');
    this.el.pause.classList.add('is-hidden');
    this.el.end.classList.add('is-hidden');
    this.el.hintDesktop.classList.add('is-hidden');
    this.el.goalFlash.classList.add('is-hidden');
    this.el.toast.classList.remove('is-show');
    this.el.menu.scrollTop = 0;
    document.body.dataset.state = 'menu';
  }

  hideMenu() {
    this.el.menu.classList.add('is-hidden');
  }

  showHud() {
    this.el.hud.classList.remove('is-hidden');
    this.el.hintDesktop.classList.remove('is-hidden');
    document.body.dataset.state = 'play';
  }

  hideHud() {
    this.el.hud.classList.add('is-hidden');
    this.el.hintDesktop.classList.add('is-hidden');
  }

  setStyle(styleId) {
    const style = PLAYSTYLES[styleId] || PLAYSTYLES.showman;
    this.el.styleChipText.textContent = style.name;
    this.el.playerStyle.textContent = style.name;
    this.el.styleChip.style.color = style.colorCss;
    this.el.styleChip.style.borderColor = `${style.colorCss}55`;
    this.el.playerStyle.style.color = style.colorCss;
    const perfect = styleId === 'sniper' ? [64, 94] : [70, 90];
    if (this.el.chargeMeter) {
      this.el.chargeMeter.style.setProperty('--perfect-a', `${perfect[0]}%`);
      this.el.chargeMeter.style.setProperty('--perfect-b', `${perfect[1]}%`);
    }
    if (this.el.shootBtn) {
      this.el.shootBtn.style.setProperty('--perfect-start', `${perfect[0] / 100}turn`);
      this.el.shootBtn.style.setProperty('--perfect-end', `${perfect[1] / 100}turn`);
    }
    const dot = this.el.styleChip.querySelector('.style-dot');
    if (dot) {
      dot.style.background = style.colorCss;
      dot.style.boxShadow = `0 0 10px ${style.colorCss}`;
    }
  }

  setPlayer(name, styleName) {
    if (!name) return;
    this.el.playerName.textContent = name;
    this.el.avatar.textContent = name.slice(0, 1);
    if (styleName) this.el.playerStyle.textContent = styleName;
  }

  updateHud(data) {
    if (!data) return;
    this.el.scoreHome.textContent = data.score.home;
    this.el.scoreAway.textContent = data.score.away;
    const t = Math.max(0, Math.ceil(data.timeLeft));
    const m = Math.floor(t / 60);
    const s = t % 60;
    this.el.clock.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.el.clockLabel.textContent = data.golden ? 'NEXT GOAL WINS' : 'FIRST TO 5';
    this.el.clockWrap.classList.toggle('is-golden', !!data.golden);
    this.el.shotsStat.textContent = data.shots ?? 0;
    this.el.posStat.textContent = `${data.possession ?? 50}%`;
    if (data.playerName) this.setPlayer(data.playerName);
    if (data.styleName) this.el.playerStyle.textContent = data.styleName;
    const stamina = Math.max(0, Math.min(100, data.stamina ?? 100));
    this.el.staminaFill.style.width = `${stamina}%`;
    this.el.stamina.classList.toggle('is-low', stamina < 24);
    if (data.styleId) this.setStyle(data.styleId);
  }

  setCharge(ratio, perfect, charging) {
    const value = clamp01(ratio);
    const btn = this.el.shootBtn;
    if (btn) {
      btn.style.setProperty('--power', String(value));
      btn.classList.toggle('is-charging', !!charging);
      btn.classList.toggle('is-perfect', !!perfect && !!charging);
    }
    if (this.el.chargeMeter) {
      this.el.chargeMeter.classList.toggle('is-on', !!charging);
      this.el.chargeMeter.classList.toggle('is-perfect', !!perfect && !!charging);
      if (this.el.chargeFill) this.el.chargeFill.style.width = `${value * 100}%`;
      if (this.el.chargeNeedle) this.el.chargeNeedle.style.left = `${value * 100}%`;
    }
  }

  setHint(text) {
    if (!text) {
      this.el.hintBar.classList.add('is-faded');
      return;
    }
    this.el.hintBar.classList.remove('is-faded');
    const key = this.el.hintBar.querySelector('.hint-key');
    const label = this.el.hintBar.querySelector('.hint-text');
    if (key) key.textContent = 'TIP';
    if (label) label.textContent = text;
  }

  toast(text, kind = '') {
    if (!text) return;
    const el = this.el.toast;
    el.textContent = text;
    el.classList.remove('is-bad', 'is-danger');
    if (kind === 'bad') el.classList.add('is-bad');
    if (kind === 'danger') el.classList.add('is-danger');
    el.classList.add('is-show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('is-show'), 1900);
  }

  showGoal({ teamName, scorer, ownGoal, score }) {
    this.el.goalKicker.textContent = ownGoal ? `${teamName} · OWN GOAL` : teamName;
    this.el.goalScorer.textContent = scorer;
    this.el.goalFlash.classList.remove('is-hidden');
    clearTimeout(this.goalTimer);
    this.goalTimer = setTimeout(() => this.el.goalFlash.classList.add('is-hidden'), 2500);
    if (score) {
      this.el.scoreHome.textContent = score.home;
      this.el.scoreAway.textContent = score.away;
    }
    document.body.dataset.state = 'goal';
  }

  hideGoal() {
    this.el.goalFlash.classList.add('is-hidden');
    clearTimeout(this.goalTimer);
  }

  flashScreen() {
    this.el.flash.classList.remove('is-on');
    void this.el.flash.offsetWidth;
    this.el.flash.classList.add('is-on');
  }

  showPause(score) {
    this.el.pauseHome.textContent = `NEON ${score?.home ?? 0}`;
    this.el.pauseAway.textContent = `${score?.away ?? 0} BOTS`;
    this.el.pause.classList.remove('is-hidden');
    document.body.dataset.state = 'paused';
  }

  hidePause() {
    this.el.pause.classList.add('is-hidden');
  }

  showEnd(data) {
    this.hideGoal();
    this.el.hud.classList.add('is-hidden');
    this.el.hintDesktop.classList.add('is-hidden');
    const win = data.result === 'win';
    const draw = data.result === 'draw';
    this.el.endKicker.textContent = data.golden ? 'GOLDEN GOAL' : data.reason || 'FULL TIME';
    this.el.endTitle.textContent = win ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT';
    this.el.endTitle.style.color = win ? 'var(--lime)' : draw ? '#c8dcf5' : 'var(--magenta)';
    this.el.endScore.textContent = `${data.score.home} — ${data.score.away}`;
    this.el.endShots.textContent = data.shots ?? 0;
    this.el.endPos.textContent = `${data.possession ?? 50}%`;
    this.el.endTackles.textContent = data.tackles ?? 0;
    this.el.endStyle.textContent = data.styleName || 'SHOWMAN';
    this.el.end.style.setProperty('--accent', data.styleName === 'SNIPER' ? 'var(--magenta)' : 'var(--lime)');
    this.el.end.classList.remove('is-hidden');
    document.body.dataset.state = 'ended';
  }

  hideEnd() {
    this.el.end.classList.add('is-hidden');
  }

  hideAllMenus() {
    this.hideMenu();
    this.hidePause();
    this.hideEnd();
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
