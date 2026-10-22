/* 字斟句酌 · data registry. Each data/texts/*.js file calls ZZ.addText({...}). */
window.ZZ = {
  ORDER: ['taohua', 'zouji', 'mashuo', 'zongqiu', 'liujingting'],
  texts: {},
  addText: function (t) { this.texts[t.id] = t; }
};
