import React, {useEffect, useMemo, useState} from "react";
import {QRCodeSVG} from "qrcode.react";
import {Card, CardContent} from "./components/ui/card";
import {Input} from "./components/ui/input";
import {Label} from "./components/ui/label";
import {Textarea} from "./components/ui/textarea";
import {Button} from "./components/ui/button";
import {AlertCircle, CheckCircle2, Copy, Moon, Printer, RotateCcw, Sun} from "lucide-react";

const initialForm = {
    payer: "",
    payee: "",
    payeeAccount: "",
    amount: "",
    paymentCode: "289",
    paymentPurpose: "",
    model: "",
    reference: "",
};

const examples = {
    payer: `Petar Petrović
Kneza Miloša 10
Beograd`,
    payee: `Elektrodistribucija Srbije
Bulevar umetnosti 12
Beograd`,
    payeeAccount: "840-955845-10",
    amount: "1025,12",
    paymentCode: "289",
    paymentPurpose: "Uplata po računu",
    model: "97",
    reference: "14123412",
};

const HISTORY_STORAGE_KEY = "nbs_ips_qr_payment_history_v1";
const THEME_STORAGE_KEY = "nbs_ips_qr_theme_v1";
const HISTORY_LIMIT = 20;

function cleanAccount(value) {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";

    // Serbian account numbers are commonly entered as bank-part-control.
    // For QR payload NBS expects fixed 18 digits without dashes.
    if (digits.length <= 3) return digits;
    if (digits.length >= 18) return digits.slice(0, 18);

    const bank = digits.slice(0, 3);
    const control = digits.slice(-2);
    const middle = digits.slice(3, -2).padStart(13, "0");
    return `${bank}${middle}${control}`;
}

function normalizeAmount(value) {
    let raw = value.trim().replace(/\s/g, "").replace(/\./g, ",");
    if (!raw) return "";

    if (!/^\d+(,\d{0,2})?$/.test(raw)) return raw;
    if (!raw.includes(",")) raw = `${raw},`;
    return `RSD${raw}`;
}

function containsCyrillic(value) {
    return /[\u0400-\u04FF]/.test(value);
}

function normalizeReference(model, reference) {
    const m = model.trim();
    const rawReference = reference.trim().replace(/\s/g, "");

    if (!m && !rawReference) return "";

    const payloadReference =
        m === "97"
            ? rawReference.replace(/-/g, "")
            : rawReference;

    if (!m && payloadReference) return payloadReference;

    return `${m}${payloadReference}`;
}

function limitLines(value, maxLines) {
    return value.split("\n").slice(0, maxLines).join("\n");
}

function validate(form, payloadParts) {
    const errors = [];
    const account = cleanAccount(form.payeeAccount);
    const amount = normalizeAmount(form.amount);
    const ro = normalizeReference(form.model, form.reference);

    if (containsCyrillic(form.payer)) errors.push("Плательщик: кириллица недопустима для NBS QR. Используйте латиницу.");
    if (containsCyrillic(form.payee)) errors.push("Получатель: кириллица недопустима для NBS QR. Используйте латиницу.");
    if (containsCyrillic(form.paymentPurpose)) errors.push("Назначение платежа: кириллица недопустима для NBS QR. Используйте латиницу.");
    if (containsCyrillic(form.reference)) errors.push("Позив на број: кириллица недопустима для NBS QR.");
    if (!form.payee.trim()) errors.push("Заполните получателя платежа.");
    if (!account) errors.push("Заполните счёт получателя.");
    if (account && !/^\d{18}$/.test(account)) errors.push("Счёт получателя должен быть приведён к 18 цифрам.");
    if (!form.amount.trim()) errors.push("Заполните сумму.");
    if (amount && !/^RSD\d+,(\d{0,2})$/.test(amount)) errors.push("Сумма должна быть в формате 1025, 1025,1 или 1025,12.");
    if (!form.paymentCode.trim()) errors.push("Заполните шифру платежа.");
    if (form.paymentCode && !/^\d{3}$/.test(form.paymentCode)) errors.push("Шифра платежа должна состоять из 3 цифр, например 289.");
    if (!form.paymentPurpose.trim()) errors.push("Заполните назначение платежа.");

    if (form.payee.length > 70) errors.push("Получатель платежа: максимум 70 символов.");
    if (form.payer.length > 70) errors.push("Плательщик: максимум 70 символов.");
    if (form.paymentPurpose.length > 35) errors.push("Назначение платежа: максимум 35 символов.");
    if (form.payee.split("\n").length > 3) errors.push("Получатель платежа: максимум 3 строки.");
    if (form.payer.split("\n").length > 3) errors.push("Плательщик: максимум 3 строки.");
    if (ro.length > 25) errors.push("Модель + позив на број: максимум 25 символов в QR payload.");
    if (form.model === "97" && ro && !/^97[0-9A-Za-z]+$/.test(ro)) errors.push("Для модели 97 позив на број в QR должен содержать только цифры/латинские буквы без дефисов.");
    if (form.model !== "97" && ro && !/^\d{2}[0-9A-Za-z-]+$/.test(ro)) errors.push("RO в QR должен начинаться с двух цифр модели; далее допустимы латинские буквы, цифры и дефисы.");
    const payload = payloadParts.join("|");
    if (payload.startsWith("|")) errors.push("QR payload не должен начинаться с разделителя |.");
    if (payload.endsWith("|")) errors.push("QR payload не должен заканчиваться разделителем |.");
    if (payload.includes("||")) errors.push("QR payload не должен содержать пустые теги.");

    return errors;
}

function buildPayload(form) {
    const account = cleanAccount(form.payeeAccount);
    const amount = normalizeAmount(form.amount);
    const ro = normalizeReference(form.model, form.reference);

    const parts = [
        ["K", "PR"],
        ["V", "01"],
        ["C", "1"],
        ["R", account],
        ["N", limitLines(form.payee.trim(), 3)],
        ["I", amount],
        ["P", limitLines(form.payer.trim(), 3)],
        ["SF", form.paymentCode.trim()],
        ["S", form.paymentPurpose.trim()],
        ["RO", ro],
    ]
        .filter(([, value]) => value !== "")
        .map(([tag, value]) => `${tag}:${value}`);

    return {
        account,
        amount,
        ro,
        parts,
        payload: parts.join("|"),
    };
}

function readHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeHistory(items) {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
}

function makeHistoryItem(form, normalized) {
    return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        title: form.payee?.split("\n")[0] || "Без получателя",
        amount: normalized.amount,
        account: normalized.account,
        purpose: form.paymentPurpose,
        payload: normalized.payload,
        form,
    };
}

function formatDateTime(value) {
    try {
        return new Intl.DateTimeFormat("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function Field({label, children, required}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-300">
                {label} {required && <span className="text-rose-400">*</span>}
            </Label>
            {children}
        </div>
    );
}

function PaymentSlip({form, normalized, printable = false}) {
    const amountValue = normalized.amount ? normalized.amount.replace(/^RSD/, "") : "";

    return (
        <div className={printable ? "payment-slip payment-slip-print" : "payment-slip"}>
            <div className="slip-title">NALOG ZA UPLATU</div>

            <div className="slip-grid">
                <div className="slip-left">
                    <SlipLine label="uplatilac" value={form.payer || ""} multiline/>
                    <SlipLine label="svrha uplate" value={form.paymentPurpose || ""}/>
                    <SlipLine label="primalac" value={form.payee || ""} multiline/>
                </div>

                <div className="slip-right">
                    <div className="slip-row-3">
                        <SlipCell label="šifra plaćanja" value={form.paymentCode || ""}/>
                        <SlipCell label="valuta" value="RSD"/>
                        <SlipCell label="iznos" value={amountValue}/>
                    </div>

                    <SlipCell label="račun primaoca" value={normalized.account || ""} big/>

                    <div className="slip-row-model">
                        <SlipCell label="model" value={form.model || ""}/>
                        <SlipCell label="poziv na broj (odobrenje)" value={form.reference || ""} big/>
                    </div>
                </div>
            </div>

            <div className="slip-footer">
                <div className="slip-signature">pečat i potpis uplatioca</div>
                <div className="slip-signature">mesto i datum prijema</div>
                <div className="slip-signature">datum valute</div>
            </div>
        </div>
    );
}

function SlipLine({label, value, multiline}) {
    return (
        <div className="slip-line">
            <div className="slip-label">{label}</div>
            <div className={multiline ? "slip-value multiline" : "slip-value"}>{value}</div>
        </div>
    );
}

function SlipCell({label, value, big}) {
    return (
        <div className={big ? "slip-cell slip-cell-big" : "slip-cell"}>
            <div className="slip-label">{label}</div>
            <div className="slip-value">{value}</div>
        </div>
    );
}

function HistoryPanel({history, onLoad, onDelete, onClear, isDark}) {
    return (
        <Card
                        className={isDark
                            ? "rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/20 backdrop-blur"
                            : "rounded-3xl border border-slate-200 bg-white/90 shadow-xl shadow-slate-300/40"
                        }>
            <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold">История платежей</h2>
                        <p className={isDark ? "text-sm text-slate-400" : "text-sm text-slate-600"}>Сохраняется локально в этом браузере.</p>
                    </div>
                    <Button type="button" variant="ghost" onClick={onClear} disabled={history.length === 0}>
                        Очистить
                    </Button>
                </div>

                {history.length === 0 ? (
                    <div className={isDark
                        ? "rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-500"
                        : "rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500"
                    }>История пока пустая.</div>
                ) : (
                    <div className="space-y-3">
                        {history.map((item) => (
                            <div key={item.id}
                                 className={isDark
                                     ? "rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm"
                                     : "rounded-xl border border-slate-200 bg-white p-3 text-sm"
                                 }>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className={isDark ? "truncate font-semibold text-slate-100" : "truncate font-semibold text-slate-900"}>{item.title}</div>
                                        <div className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</div>
                                    </div>
                                    <div className="shrink-0 font-semibold">{item.amount || "—"}</div>
                                </div>
                                <div className={isDark ? "mt-2 space-y-1 text-xs text-slate-400" : "mt-2 space-y-1 text-xs text-slate-600"}>
                                    <div className="break-all">Счёт: {item.account || "—"}</div>
                                    <div className="truncate">Назначение: {item.purpose || "—"}</div>
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <Button type="button" variant="outline" onClick={() => onLoad(item)}>
                                        Загрузить
                                    </Button>
                                    <Button type="button" variant="ghost" onClick={() => onDelete(item.id)}>
                                        Удалить
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function PrintStyles() {
    return (
        <style>{`
      .payment-slip {
        width: 100%;
        max-width: 760px;
        background: #fff;
        color: #111;
        border: 2px solid #111;
        padding: 14px 16px 12px;
        font-family: Arial, Helvetica, sans-serif;
        box-sizing: border-box;
      }

      .slip-title {
        text-align: center;
        font-weight: 800;
        font-size: 20px;
        letter-spacing: 0.04em;
        margin-bottom: 12px;
      }

      .slip-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 22px;
      }

      .slip-left,
      .slip-right {
        display: grid;
        gap: 10px;
        align-content: start;
      }

      .slip-row-3 {
        display: grid;
        grid-template-columns: 92px 72px 1fr;
        gap: 8px;
      }

      .slip-row-model {
        display: grid;
        grid-template-columns: 72px 1fr;
        gap: 8px;
      }

      .slip-line,
      .slip-cell {
        position: relative;
        min-height: 44px;
        border-bottom: 2px solid #111;
        padding: 16px 6px 4px;
        box-sizing: border-box;
      }

      .slip-line {
        min-height: 64px;
      }

      .slip-cell {
        border: 2px solid #111;
        min-height: 48px;
      }

      .slip-cell-big {
        min-height: 52px;
      }

      .slip-label {
        position: absolute;
        top: 2px;
        left: 6px;
        font-size: 10px;
        line-height: 1;
        color: #222;
      }

      .slip-value {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.2;
        white-space: pre-line;
        word-break: break-word;
      }

      .slip-value.multiline {
        font-size: 13px;
      }

      .slip-footer {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 22px;
        margin-top: 28px;
        font-size: 10px;
        text-align: center;
      }

      .slip-signature {
        border-top: 1.5px solid #111;
        padding-top: 4px;
      }

      @media print {
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        html,
        body,
        #root {
          width: 100%;
          min-height: 0 !important;
          background: #ffffff !important;
          overflow: visible !important;
        }

        body * {
          visibility: hidden !important;
        }

        #print-area,
        #print-area * {
          visibility: visible !important;
        }

        #print-area {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: 190mm !important;
          height: auto !important;
          background: #ffffff !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
        }

        .payment-slip-print {
          width: 190mm !important;
          max-width: 190mm !important;
          height: 95mm !important;
          border: 2px solid #111 !important;
          box-shadow: none !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        #print-area .print-qr-block {
          margin-top: 6mm !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        button,
        input,
        textarea {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `}</style>
    );
}

export default function NbsIpsQrPaymentApp() {
    const [form, setForm] = useState(initialForm);
    const [theme, setTheme] = useState(() => {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY) || "dark";
        } catch {
            return "dark";
        }
    });
    const [copied, setCopied] = useState(false);
    const [nbsValidation, setNbsValidation] = useState({status: "idle", message: "", errors: []});
    const [history, setHistory] = useState([]);

    useEffect(() => {
        setHistory(readHistory());
    }, []);

    useEffect(() => {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    const normalized = useMemo(() => buildPayload(form), [form]);
    const errors = useMemo(() => validate(form, normalized.parts), [form, normalized.parts]);
    const isValid = errors.length === 0;

    function update(name, value) {
        setForm((prev) => ({...prev, [name]: value}));
        setCopied(false);
        setNbsValidation({status: "idle", message: "", errors: []});
    }

    function saveToHistory() {
        if (!isValid) return;
        const item = makeHistoryItem(form, normalized);
        const nextHistory = [item, ...history].slice(0, HISTORY_LIMIT);
        setHistory(nextHistory);
        writeHistory(nextHistory);
    }

    function loadFromHistory(item) {
        setForm({...initialForm, ...item.form});
        setCopied(false);
        setNbsValidation({status: "idle", message: "", errors: []});
    }

    function deleteFromHistory(id) {
        const nextHistory = history.filter((item) => item.id !== id);
        setHistory(nextHistory);
        writeHistory(nextHistory);
    }

    function clearHistory() {
        setHistory([]);
        writeHistory([]);
    }

    function toggleTheme() {
        setTheme((prev) => prev === "dark" ? "light" : "dark");
    }

    async function copyPayload() {
        await navigator.clipboard.writeText(normalized.payload);
        setCopied(true);
    }

    function printPaymentSlip() {
        window.print();
    }

    async function validateWithNbs() {
        if (!normalized.payload || !isValid) {
            setNbsValidation({
                status: "error",
                message: "Сначала исправьте локальные ошибки формы.",
                errors,
            });
            return;
        }

        setNbsValidation({status: "loading", message: "Проверка через NBS Validator API...", errors: []});

        try {
            const response = await fetch("/api/nbs-validate", {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain; charset=UTF-8",
                },
                body: normalized.payload,
            });

            const data = await response.json();
            const ok = data?.s?.code === 0;

            setNbsValidation({
                status: ok ? "success" : "error",
                message: ok ? "NBS Validator: QR payload соответствует спецификации." : `NBS Validator: ${data?.s?.desc || "ошибка валидации"}`,
                errors: Array.isArray(data?.e) ? data.e : [],
            });
        } catch (error) {
            setNbsValidation({
                status: "error",
                message: "Не удалось обратиться к NBS Validator API. Проверьте proxy/CORS и соединение.",
                errors: [String(error?.message || error)],
            });
        }
    }

    const isDark = theme === "dark";

    return (
        <div className={isDark
            ? "min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 text-slate-100 md:p-8"
            : "min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 p-4 text-slate-900 md:p-8"
        }>
            <PrintStyles/>
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="space-y-2">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div
                                className={isDark
                                    ? "inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-300 backdrop-blur"
                                    : "inline-flex rounded-full border border-cyan-600/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700"
                                }
                            >
                                NBS IPS QR / PR payment
                            </div>
                        </div>

                        <Button type="button" variant="outline" onClick={toggleTheme}>
                            {isDark ? (
                                <>
                                    <Sun className="mr-2 h-4 w-4"/> Светлая тема
                                </>
                            ) : (
                                <>
                                    <Moon className="mr-2 h-4 w-4"/> Тёмная тема
                                </>
                            )}
                        </Button>
                    </div>

                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Генератор QR-кода платежа в
                        Сербии</h1>
                    <p className={`max-w-3xl ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Заполните реквизиты, проверьте сформированную платёжку и получите QR-код для банковского
                        приложения.
                    </p>
                </header>

                <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                    <Card
                        className={isDark
                            ? "rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/20 backdrop-blur"
                            : "rounded-3xl border border-slate-200 bg-white/90 shadow-xl shadow-slate-300/40"
                        }>
                        <CardContent className="space-y-5 p-6">
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" onClick={() => setForm(examples)}>
                                    Заполнить примером
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => setForm(initialForm)}>
                                    <RotateCcw className="mr-2 h-4 w-4"/> Очистить
                                </Button>
                                <Button type="button" variant="outline" onClick={printPaymentSlip} disabled={!isValid}>
                                    <Printer className="mr-2 h-4 w-4"/> Печать / PDF
                                </Button>
                                <Button type="button" variant="outline" onClick={saveToHistory} disabled={!isValid}>
                                    Сохранить в историю
                                </Button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Плательщик / Uplatilac">
                                    <Textarea
                                        value={form.payer}
                                        onChange={(e) => update("payer", limitLines(e.target.value, 3))}
                                        placeholder="Имя, адрес, город"
                                        rows={3}
                                    />
                                </Field>

                                <Field label="Получатель / Primalac" required>
                                    <Textarea
                                        value={form.payee}
                                        onChange={(e) => update("payee", limitLines(e.target.value, 3))}
                                        placeholder="Название/ФИО получателя"
                                        rows={3}
                                    />
                                </Field>

                                <Field label="Счёт получателя" required>
                                    <Input
                                        value={form.payeeAccount}
                                        onChange={(e) => update("payeeAccount", e.target.value)}
                                        placeholder="840-955845-10"
                                    />
                                </Field>

                                <Field label="Сумма RSD" required>
                                    <Input
                                        value={form.amount}
                                        onChange={(e) => update("amount", e.target.value)}
                                        placeholder="1025,12"
                                        inputMode="decimal"
                                    />
                                </Field>

                                <Field label="Шифра платежа" required>
                                    <Input
                                        value={form.paymentCode}
                                        onChange={(e) => update("paymentCode", e.target.value.replace(/\D/g, "").slice(0, 3))}
                                        placeholder="289"
                                        inputMode="numeric"
                                    />
                                </Field>

                                <Field label="Назначение платежа" required>
                                    <Input
                                        value={form.paymentPurpose}
                                        onChange={(e) => update("paymentPurpose", e.target.value.slice(0, 35))}
                                        placeholder="Uplata po računu"
                                    />
                                </Field>

                                <Field label="Модель">
                                    <Input
                                        value={form.model}
                                        onChange={(e) => update("model", e.target.value.replace(/\D/g, "").slice(0, 2))}
                                        placeholder="97 или 00"
                                        inputMode="numeric"
                                    />
                                </Field>

                                <Field label="Позив на број / Reference">
                                    <Input
                                        value={form.reference}
                                        onChange={(e) => update("reference", e.target.value.replace(/\s/g, ""))}
                                        placeholder="14123412"
                                    />
                                </Field>
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-black/40 p-4 text-sm text-slate-100">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="font-semibold">QR payload</span>
                                    <div className="flex gap-2">
                                        <Button type="button" size="sm" variant="secondary" onClick={copyPayload}
                                                disabled={!normalized.payload}>
                                            <Copy className="mr-2 h-4 w-4"/> {copied ? "Скопировано" : "Копировать"}
                                        </Button>
                                        <Button type="button" size="sm" variant="secondary" onClick={validateWithNbs}
                                                disabled={!isValid || nbsValidation.status === "loading"}>
                                            {nbsValidation.status === "loading" ? "Проверка..." : "Проверить NBS"}
                                        </Button>
                                    </div>
                                </div>
                                <pre
                                    className="whitespace-pre-wrap break-all text-xs leading-relaxed">{normalized.payload || "—"}</pre>
                            </div>

                            {nbsValidation.status !== "idle" && (
                                <div
                                    className={`rounded-2xl border p-4 ${nbsValidation.status === "success" ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"}`}>
                                    <div className="font-semibold">{nbsValidation.message}</div>
                                    {nbsValidation.errors.length > 0 && (
                                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                                            {nbsValidation.errors.map((errorItem, index) => (
                                                <li key={`${errorItem}-${index}`}>{errorItem}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            <div
                                className={`rounded-2xl border p-4 ${isValid ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
                                <div className="mb-2 flex items-center gap-2 font-semibold">
                                    {isValid ? <CheckCircle2 className="h-5 w-5"/> : <AlertCircle className="h-5 w-5"/>}
                                    {isValid ? "Данные готовы для генерации QR" : "Нужно исправить"}
                                </div>
                                {!isValid && (
                                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                                        {errors.map((error) => (
                                            <li key={error}>{error}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card
                            className={isDark
                                ? "rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/20 backdrop-blur print:shadow-none print:border-0"
                                : "rounded-3xl border border-slate-200 bg-white/90 shadow-xl shadow-slate-300/40 print:shadow-none print:border-0"
                            }>
                            <CardContent className="p-5 print:p-0">
                                <div id="print-area">
                                    <PaymentSlip form={form} normalized={normalized} printable/>
                                    {isValid && (
                                        <div className="print-qr-block mt-4 hidden print:block">
                                            <div className="mb-2 text-sm font-bold">NBS IPS QR</div>
                                            <QRCodeSVG value={normalized.payload} size={170} level="M"/>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                        className={isDark
                            ? "rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/20 backdrop-blur"
                            : "rounded-3xl border border-slate-200 bg-white/90 shadow-xl shadow-slate-300/40"
                        }>
                            <CardContent className="space-y-4 p-5">
                                <div>
                                    <h2 className="text-xl font-bold">NBS IPS QR</h2>
                                    <p className="text-sm text-slate-400">QR генерируется только когда обязательные поля
                                        заполнены корректно.</p>
                                </div>

                                <div
                                    className="flex justify-center rounded-2xl border border-slate-700 bg-slate-950/70 p-6">
                                    {isValid ? (
                                        <QRCodeSVG value={normalized.payload} size={230} level="M"/>
                                    ) : (
                                        <div
                                            className="flex h-[230px] w-[230px] items-center justify-center rounded-xl border border-dashed text-center text-sm text-slate-500">
                                            Заполните форму без ошибок
                                        </div>
                                    )}
                                </div>

                                <div
                                    className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
                                    Рядом с QR-кодом на счёте/фактуре должна быть подпись <b>NBS IPS QR</b>.
                                </div>
                            </CardContent>
                        </Card>

                        <HistoryPanel
                            history={history}
                            onLoad={loadFromHistory}
                            onDelete={deleteFromHistory}
                            onClear={clearHistory}
                            isDark={isDark}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
