import { ProviderSnapshot } from "../domain/types";

export interface ProviderAdapter {
  readonly id: "github" | "bitbucket";
  fetchSnapshot(): Promise<ProviderSnapshot>;
}
