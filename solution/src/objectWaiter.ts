import { Deferred } from "./promise";

class ObjectWaiter {
  private waiters: Map<string, Deferred<any>> = new Map();

  waitFor(objectId: string, timeout: number = 10000): Promise<any> {
    const existing = this.waiters.get(objectId);
    if (existing) return existing.promise;

    const deferred = new Deferred<any>();
    this.waiters.set(objectId, deferred);

    setTimeout(() => {
      if (this.waiters.get(objectId) === deferred) {
        this.waiters.delete(objectId);
        deferred.reject(
          new Error("🕒 Timeout waiting for object: " + objectId)
        );
      }
    }, timeout);

    return deferred.promise;
  }

  notify(objectId: string, object: any) {
    const deferred = this.waiters.get(objectId);
    if (deferred) {
      this.waiters.delete(objectId);
      deferred.resolve(object);
    }
  }
}

export const objectWaiter = new ObjectWaiter();
