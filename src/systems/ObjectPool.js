export default class ObjectPool {
  constructor(scene, factoryFn) {
    this.scene = scene;
    this.factoryFn = factoryFn; // () => gameObject
    this.free = [];
    this.inUse = new Set();
  }

  acquire() {
    let obj;
    if (this.free.length > 0) {
      obj = this.free.pop();
    } else {
      obj = this.factoryFn();
    }
    this.inUse.add(obj);
    if (obj.setActive) obj.setActive(true);
    if (obj.setVisible) obj.setVisible(true);
    return obj;
  }

  release(obj) {
    if (!this.inUse.has(obj)) return;
    this.inUse.delete(obj);
    this.free.push(obj);
    if (obj.setActive) obj.setActive(false);
    if (obj.setVisible) obj.setVisible(false);
  }
}
