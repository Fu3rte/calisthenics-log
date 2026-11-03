/**
 * 模型配置的全局状态：清单、本机设置、provider 连接状态与面板开合。
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
import { putConnection } from "@/features/coach-chat/api/connectionApi";
import {
  addCustomProvider,
  fetchPicker,
  removeCustomProvider,
} from "@/features/coach-chat/api/providerApi";
import {
  clearSettings,
  loadSettings,
  saveSettings as persistSettings,
} from "@/features/coach-chat/api/settingsStore";
import type {
  ChatSettings,
  CustomProviderInput,
  ModelCatalog,
  PickerEntry,
  ProviderCredential,
} from "@/features/coach-chat/model/chat";

interface ChatSettingsValue {
  catalog: ModelCatalog | null;
  /** null 表示尚未确定，请求时不带 settings，由服务端用默认值 */
  settings: ChatSettings | null;
  /** 当前模型的显示名，清单没到就是 null */
  modelLabel: string | null;
  credentials: ProviderCredential[];
  /** 添加 Provider 浮层的数据，null 表示还没拉过 */
  picker: PickerEntry[] | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  save: (next: ChatSettings) => void;
  reset: () => void;
  /** 写密钥后立即刷新清单，未配置的 provider 才会变成可选 */
  updateKey: (provider: string, apiKey: string) => Promise<void>;
  loadPicker: () => Promise<PickerEntry[]>;
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
  const [stored, setStored] = useState<ChatSettings | null>(loadSettings);
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [picker, setPicker] = useState<PickerEntry[] | null>(null);
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
  const settings = useMemo(() => {
    if (!catalog) return stored;
    if (stored && catalog.models.some((option) => option.id === stored.model)) {
      return stored;
    }
    return catalog.defaults;
  }, [catalog, stored]);

  const modelLabel = useMemo(() => {
    const modelId = settings?.model;
    if (!modelId) return null;
    return (
      catalog?.models.find((option) => option.id === modelId)?.label ?? modelId
    );
  }, [catalog, settings]);

  const save = useCallback((next: ChatSettings) => {
    setStored(next);
    persistSettings(next);
  }, []);

  const reset = useCallback(() => {
    setStored(null);
    clearSettings();
  }, []);

  const updateKey = useCallback(async (provider: string, apiKey: string) => {
    const next = await putConnection(provider, apiKey);
    setCredentials(next);
    /* 密钥写了不刷清单，面板里的模型行还停在未配置状态 */
    setCatalog(await fetchModelCatalog());
  }, []);

  const loadPicker = useCallback(async () => {
    const next = await fetchPicker();
    setPicker(next);
    return next;
  }, []);

  const addCustom = useCallback(async (input: CustomProviderInput) => {
    setPicker(await addCustomProvider(input));
    setCatalog(await fetchModelCatalog());
  }, []);

  const removeCustom = useCallback(async (id: string) => {
    setPicker(await removeCustomProvider(id));
    setCatalog(await fetchModelCatalog());
  }, []);

  const value = useMemo<ChatSettingsValue>(
    () => ({
      catalog,
      settings,
      modelLabel,
      credentials,
      picker,
      open,
      setOpen,
      save,
      reset,
      updateKey,
      loadPicker,
      addCustom,
      removeCustom,
    }),
    [
      catalog,
      settings,
      modelLabel,
      credentials,
      picker,
      open,
      save,
      reset,
      updateKey,
      loadPicker,
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
