/**
 * 模型配置的全局状态：清单、本机选的模型、provider 连接状态与面板开合。
 *
 * 侧栏底部入口在壳层，聊天页在路由里，两边必须共用同一份，所以状态下沉到这里。
 * 密钥不落浏览器存储，面板只持有服务端返回的掩码。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchModelCatalog } from "@/features/coach-chat/api/modelCatalog";
import {
  addCustomProvider,
  putConnection,
  removeCustomProvider,
} from "@/features/coach-chat/api/providerApi";
import {
  clearModel,
  loadModel,
  saveModel,
} from "@/features/coach-chat/api/settingsStore";
import type {
  CustomProviderInput,
  ModelCatalog,
  ProviderCredential,
} from "@/features/coach-chat/model/chat";

interface ChatSettingsValue {
  catalog: ModelCatalog | null;
  /** null 表示尚未确定，请求时不带 settings，由服务端用默认模型 */
  model: string | null;
  /** 当前模型的显示名，清单没到就是 null */
  modelLabel: string | null;
  credentials: ProviderCredential[];
  open: boolean;
  setOpen: (open: boolean) => void;
  save: (model: string) => void;
  reset: () => void;
  /** 写密钥后立即刷新清单，未配置的 provider 才会变成可选 */
  updateKey: (provider: string, apiKey: string) => Promise<void>;
  addCustom: (input: CustomProviderInput) => Promise<void>;
  removeCustom: (id: string) => Promise<void>;
}

const ChatSettingsContext = createContext<ChatSettingsValue | null>(null);

export function useChatSettings(): ChatSettingsValue {
  const context = useContext(ChatSettingsContext);
  if (!context) {
    throw new Error("useChatSettings 必须在 ChatSettingsProvider 内使用");
  }
  return context;
}

export function ChatSettingsProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [storedModel, setStoredModel] = useState<string | null>(loadModel);
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchModelCatalog()
      .then((next) => {
        if (!alive) return;
        setCatalog(next);
        setCredentials(next.credentials);
      })
      .catch(() => {
        /* 拿不到清单就沿用本地值或服务端默认 */
      });
    return () => {
      alive = false;
    };
  }, []);

  /* 本机存的模型不在清单里（换了 provider 体系或旧值）时回落默认，避免对话卡死 */
  const model = useMemo<string | null>(() => {
    if (!catalog) return null;
    return storedModel && catalog.models.some((option) => option.id === storedModel)
      ? storedModel
      : catalog.defaults.model;
  }, [catalog, storedModel]);

  const modelLabel = useMemo(() => {
    const modelId = model ?? storedModel;
    if (!modelId) return null;
    return (
      catalog?.models.find((option) => option.id === modelId)?.label ?? modelId
    );
  }, [catalog, model, storedModel]);

  const save = useCallback((next: string) => {
    setStoredModel(next);
    saveModel(next);
  }, []);

  const reset = useCallback(() => {
    setStoredModel(null);
    clearModel();
  }, []);

  /* 配置写过以后清单里的可选模型才会变，三处改动共用同一次刷新 */
  const refresh = useCallback(async () => {
    setCatalog(await fetchModelCatalog());
  }, []);

  const updateKey = useCallback(
    async (provider: string, apiKey: string) => {
      setCredentials(await putConnection(provider, apiKey));
      await refresh();
    },
    [refresh]
  );

  const addCustom = useCallback(
    async (input: CustomProviderInput) => {
      await addCustomProvider(input);
      await refresh();
    },
    [refresh]
  );

  const removeCustom = useCallback(
    async (id: string) => {
      await removeCustomProvider(id);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<ChatSettingsValue>(
    () => ({
      catalog,
      model,
      modelLabel,
      credentials,
      open,
      setOpen,
      save,
      reset,
      updateKey,
      addCustom,
      removeCustom,
    }),
    [
      catalog,
      model,
      modelLabel,
      credentials,
      open,
      save,
      reset,
      updateKey,
      addCustom,
      removeCustom,
    ]
  );

  return (
    <ChatSettingsContext.Provider value={value}>
      {children}
    </ChatSettingsContext.Provider>
  );
}
