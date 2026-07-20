declare module "@runtime-config" {
  export interface RuntimeConfig {
    environment:
      | "local"
      | "customer-qr-uat"
      | "release-rehearsal"
      | "production"
      | "unknown";
    customerQrEnabled: boolean;
    isCustomerQrUat: boolean;
    isReleaseRehearsal: boolean;
  }

  export const runtimeConfig: RuntimeConfig;
  export const customerQrStaffLabel: string;
}
