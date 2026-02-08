export class ObjectPool {
  constructor(createFn, initialSize) {
    if (initialSize === undefined) initialSize = 50;
    this.pool = [];
    this.active = [];
    this.createFn = createFn;
    for (let i = 0; i < initialSize; i++) {
      const obj = createFn();
      obj.mesh.visible = false;
      this.pool.push(obj);
    }
  }

  acquire() {
    let obj = this.pool.pop();
    if (!obj) {
      obj = this.createFn();
    }
    obj.mesh.visible = true;
    this.active.push(obj);
    return obj;
  }

  release(obj) {
    obj.mesh.visible = false;
    const idx = this.active.indexOf(obj);
    if (idx !== -1) {
      // Swap-remove: O(1) instead of O(n) splice
      const last = this.active.length - 1;
      if (idx !== last) this.active[idx] = this.active[last];
      this.active.length = last;
    }
    this.pool.push(obj);
  }

  releaseAll() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obj = this.active[i];
      obj.mesh.visible = false;
      this.pool.push(obj);
    }
    this.active.length = 0;
  }

  getActive() { return this.active; }
}
