export class Deferred {
  promise;
  _resolve;
  _reject;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  resolve(value) {
    this._resolve(value);
  }

  reject(reason) {
    this._reject(reason);
  }
}
