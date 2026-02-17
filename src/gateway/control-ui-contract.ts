export const CONTROL_UI_BOOTSTRAP_CONFIG_PATH = "/__cullmate__/control-ui-config.json";

export type ControlUiBootstrapConfig = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string;
  assistantAgentId: string;
  authToken?: string;
};
