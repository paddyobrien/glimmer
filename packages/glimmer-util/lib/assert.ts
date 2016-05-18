import Logger from './logger';
import { Option, Maybe } from './platform-utils';

let alreadyWarned = false;

export function debugUnwrap<T>(value: Maybe<T>): T {
  if (!alreadyWarned) {
    alreadyWarned = true;
    Logger.warn("Don't leave debug assertions on in public builds");
  }

  if (value === null || value === undefined) {
    throw new Error(`Expected ${value} to not be null or undefined`);
  } else {
    return value;
  }
}

export function prodUnwrap<T>(value: Maybe<T>): T {
  return value as T;
}

export function debugAssertType<T>(value: any, predicate: boolean, message: string): T {
  if (!alreadyWarned) {
    alreadyWarned = true;
    Logger.warn("Don't leave debug assertions on in public builds");
  }

  if (predicate) {
    return value;
  } else {
    throw new Error(message);
  }
}

export function prodAssertType<T>(value: any, predicate: boolean, message: string): T {
  return value;
}

export { debugAssertType as assertType, debugUnwrap as unwrap };

export function debugAssert(test, msg) {
  if (!alreadyWarned) {
    alreadyWarned = true;
    Logger.warn("Don't leave debug assertions on in public builds");
  }

  if (!test) {
    throw new Error(msg || "assertion failure");
  }
}

export function prodAssert() {}

export default debugAssert;