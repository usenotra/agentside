import { VENDORS } from "../constants/vendors";
import type { Vendor } from "../types/landing";

export function isVendor(value: string): value is Vendor {
  return (VENDORS as readonly string[]).includes(value);
}
