/**
 * 组合根：装配端口与适配器，启动 HTTP 服务。
 * 换模型、换数据源只改这里，领域与应用层不动。
 */
import { AskCoach } from "./application/AskCoach.js";
import { CoachSetup } from "./application/CoachSetup.js";
import { loadConfig } from "./config.js";
import { ChatServer } from "./infrastructure/http/ChatServer.js";
import { EnvCredentials } from "./infrastructure/llm/EnvCredentials.js";
import { PiCoachModel } from "./infrastructure/llm/PiCoachModel.js";
import { ProviderRegistry } from "./infrastructure/llm/providerRegistry.js";
import { JsonCustomProviderStore } from "./infrastructure/persistence/JsonCustomProviderStore.js";
import { JsonTrainingLogRepository } from "./infrastructure/persistence/JsonTrainingLogRepository.js";

async function main(): Promise<void> {
  const config = loadConfig();

  /* 注册表要先 init（离线问出各家的环境变量名），凭证才知道能往哪些键写 */
  const registry = new ProviderRegistry();
  await registry.init();

  const customStore = new JsonCustomProviderStore(config.providersJsonPath);
  registry.setCustomProviders(await customStore.load());

  /* 项目根 .env 先灌进进程，缺密钥不拦启动：对话时才报，面板里能当场补 */
  const credentials = new EnvCredentials({
    envPath: config.envPath,
    piAuthPath: config.piAuthPath,
    registry,
  });
  credentials.load();

  const coachModel = new PiCoachModel(registry, credentials);

  const askCoach = new AskCoach({
    trainingLogs: new JsonTrainingLogRepository(config.trainingLogPath),
    coachModel,
    defaults: { modelId: config.modelId, maxTokens: config.maxTokens },
  });

  const setup = new CoachSetup({
    coachModel,
    credentials,
    registry,
    customStore,
    defaults: askCoach.defaults,
  });

  const server = new ChatServer({ askCoach, setup, host: config.host, port: config.port });

  await server.listen();
  console.log(
    `训练问答已就绪 http://${config.host}:${config.port} · ${config.modelId} · ${registry.credentialTargets().length} 家可填密钥`
  );
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exit(1);
});
