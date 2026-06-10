import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronDown, Globe, Sparkles } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getFirebaseDb } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTooltip?: boolean;
  highlight?: boolean;
}

type LanguageOption = { code: string; name: string };
type LanguageGroup = { label: string; languages: LanguageOption[] };

/**
 * Languages organised by region. The popover renders these as titled
 * sections; LANGUAGE_OPTIONS (flat) is derived below for consumers that
 * need the full list (editors, admin, etc.).
 */
const LANGUAGE_GROUPS: LanguageGroup[] = [
  {
    label: "Popular",
    languages: [
      { code: "en", name: "English" },
      { code: "hi", name: "Hindi (हिन्दी)" },
      { code: "ta", name: "Tamil (தமிழ்)" },
      { code: "es", name: "Spanish (Español)" },
      { code: "fr", name: "French (Français)" },
      { code: "ar", name: "Arabic (العربية)" },
      { code: "zh", name: "Chinese Mandarin (中文)" },
      { code: "bn", name: "Bengali (বাংলা)" },
      { code: "pt", name: "Portuguese (Português)" },
      { code: "ru", name: "Russian (Русский)" },
      { code: "ur", name: "Urdu (اردو)" },
      { code: "id", name: "Indonesian (Bahasa Indonesia)" },
      { code: "de", name: "German (Deutsch)" },
      { code: "ja", name: "Japanese (日本語)" },
      { code: "te", name: "Telugu (తెలుగు)" },
      { code: "mr", name: "Marathi (मराठी)" },
      { code: "tr", name: "Turkish (Türkçe)" },
      { code: "vi", name: "Vietnamese (Tiếng Việt)" },
      { code: "ko", name: "Korean (한국어)" },
      { code: "it", name: "Italian (Italiano)" },
      { code: "sw", name: "Swahili (Kiswahili)" },
    ],
  },
  {
    label: "Indian languages",
    languages: [
      { code: "kn", name: "Kannada (ಕನ್ನಡ)" },
      { code: "ml", name: "Malayalam (മലയാളം)" },
      { code: "gu", name: "Gujarati (ગુજરાતી)" },
      { code: "pa", name: "Punjabi (ਪੰਜਾਬੀ)" },
      { code: "or", name: "Odia (ଓଡ଼ିଆ)" },
      { code: "as", name: "Assamese (অসমীয়া)" },
      { code: "sa", name: "Sanskrit (संस्कृतम्)" },
      { code: "ne", name: "Nepali (नेपाली)" },
      { code: "kok", name: "Konkani (कोंकणी)" },
      { code: "mni", name: "Manipuri (ꯃꯩꯇꯩꯂꯣꯟ)" },
      { code: "brx", name: "Bodo (बड़ो)" },
      { code: "doi", name: "Dogri (डोगरी)" },
      { code: "mai", name: "Maithili (मैथिली)" },
      { code: "sat", name: "Santhali (ᱥᱟᱱᱛᱟᱲᱤ)" },
      { code: "ks", name: "Kashmiri (کٲشُر)" },
      { code: "sd", name: "Sindhi (سنڌي)" },
      { code: "tcy", name: "Tulu (ತುಳು)" },
      { code: "kfa", name: "Kodava (ಕೊಡವ)" },
      { code: "bho", name: "Bhojpuri (भोजपुरी)" },
      { code: "mag", name: "Magahi (मगही)" },
      { code: "hne", name: "Chhattisgarhi (छत्तीसगढ़ी)" },
      { code: "raj", name: "Rajasthani (राजस्थानी)" },
      { code: "bgc", name: "Haryanvi (हरियाणवी)" },
      { code: "awa", name: "Awadhi (अवधी)" },
      { code: "gbm", name: "Garhwali (गढ़वळि)" },
      { code: "kfy", name: "Kumaoni (कुमाऊँनी)" },
      { code: "bhb", name: "Bhili (भीली)" },
      { code: "gon", name: "Gondi (गोंडी)" },
      { code: "lus", name: "Mizo (Lushai) (Mizo ṭawng)" },
      { code: "kha", name: "Khasi (Ka Ktien Khasi)" },
      { code: "grt", name: "Garo (Mandi)" },
    ],
  },
  {
    label: "European",
    languages: [
      { code: "nl", name: "Dutch (Nederlands)" },
      { code: "sv", name: "Swedish (Svenska)" },
      { code: "no", name: "Norwegian (Norsk)" },
      { code: "da", name: "Danish (Dansk)" },
      { code: "fi", name: "Finnish (Suomi)" },
      { code: "is", name: "Icelandic (Íslenska)" },
      { code: "ga", name: "Irish (Gaeilge)" },
      { code: "cy", name: "Welsh (Cymraeg)" },
      { code: "gd", name: "Scottish Gaelic (Gàidhlig)" },
      { code: "pl", name: "Polish (Polski)" },
      { code: "cs", name: "Czech (Čeština)" },
      { code: "sk", name: "Slovak (Slovenčina)" },
      { code: "hu", name: "Hungarian (Magyar)" },
      { code: "ro", name: "Romanian (Română)" },
      { code: "bg", name: "Bulgarian (Български)" },
      { code: "el", name: "Greek (Ελληνικά)" },
      { code: "sq", name: "Albanian (Shqip)" },
      { code: "sr", name: "Serbian (Српски)" },
      { code: "hr", name: "Croatian (Hrvatski)" },
      { code: "bs", name: "Bosnian (Bosanski)" },
      { code: "sl", name: "Slovenian (Slovenščina)" },
      { code: "uk", name: "Ukrainian (Українська)" },
      { code: "be", name: "Belarusian (Беларуская)" },
      { code: "lv", name: "Latvian (Latviešu)" },
      { code: "lt", name: "Lithuanian (Lietuvių)" },
      { code: "et", name: "Estonian (Eesti)" },
      { code: "mt", name: "Maltese (Malti)" },
      { code: "eu", name: "Basque (Euskara)" },
      { code: "ca", name: "Catalan (Català)" },
      { code: "gl", name: "Galician (Galego)" },
    ],
  },
  {
    label: "Middle East & Central Asia",
    languages: [
      { code: "he", name: "Hebrew (עברית)" },
      { code: "fa", name: "Persian (فارسی)" },
      { code: "ps", name: "Pashto (پښتو)" },
      { code: "ku", name: "Kurdish (Kurdî)" },
      { code: "prs", name: "Dari (دری)" },
      { code: "uz", name: "Uzbek (Oʻzbek)" },
      { code: "kk", name: "Kazakh (Қазақ)" },
      { code: "tk", name: "Turkmen (Türkmen)" },
      { code: "az", name: "Azerbaijani (Azərbaycan)" },
      { code: "tg", name: "Tajik (Тоҷикӣ)" },
    ],
  },
  {
    label: "African",
    languages: [
      { code: "am", name: "Amharic (አማርኛ)" },
      { code: "om", name: "Oromo (Afaan Oromoo)" },
      { code: "ti", name: "Tigrinya (ትግርኛ)" },
      { code: "ha", name: "Hausa" },
      { code: "yo", name: "Yoruba (Yorùbá)" },
      { code: "ig", name: "Igbo" },
      { code: "zu", name: "Zulu (isiZulu)" },
      { code: "xh", name: "Xhosa (isiXhosa)" },
      { code: "af", name: "Afrikaans" },
      { code: "so", name: "Somali (Soomaali)" },
      { code: "ber", name: "Berber (Tamazight) (ⵜⴰⵎⴰⵣⵉⵖⵜ)" },
      { code: "sn", name: "Shona (chiShona)" },
      { code: "st", name: "Sesotho" },
      { code: "tn", name: "Tswana (Setswana)" },
    ],
  },
  {
    label: "East & Southeast Asia",
    languages: [
      { code: "yue", name: "Chinese Cantonese (粵語)" },
      { code: "th", name: "Thai (ไทย)" },
      { code: "km", name: "Khmer (ភាសាខ្មែរ)" },
      { code: "lo", name: "Lao (ລາວ)" },
      { code: "my", name: "Burmese (မြန်မာ)" },
      { code: "ms", name: "Malay (Bahasa Melayu)" },
      { code: "jw", name: "Javanese (Basa Jawa)" },
      { code: "su", name: "Sundanese (Basa Sunda)" },
      { code: "mn", name: "Mongolian (Монгол)" },
      { code: "bo", name: "Tibetan (བོད་སྐད)" },
    ],
  },
  {
    label: "More languages",
    languages: [
      { code: "tl", name: "Tagalog (Filipino)" },
      { code: "hy", name: "Armenian (Հայերեն)" },
      { code: "ka", name: "Georgian (ქართული)" },
      { code: "ky", name: "Kyrgyz (Кыргызча)" },
      { code: "si", name: "Sinhala (සිංහල)" },
      { code: "fy", name: "Frisian (Frysk)" },
      { code: "yi", name: "Yiddish (ייִדיש)" },
      { code: "la", name: "Latin (Latina)" },
      { code: "eo", name: "Esperanto" },
      { code: "lb", name: "Luxembourgish (Lëtzebuergesch)" },
      { code: "mk", name: "Macedonian (Македонски)" },
      { code: "mg", name: "Malagasy" },
      { code: "tt", name: "Tatar (Татарча)" },
      { code: "ceb", name: "Cebuano" },
      { code: "ny", name: "Chichewa (Nyanja)" },
      { code: "co", name: "Corsican (Corsu)" },
      { code: "ht", name: "Haitian Creole (Kreyòl)" },
      { code: "hmn", name: "Hmong" },
      { code: "nv", name: "Navajo (Diné bizaad)" },
      { code: "qu", name: "Quechua (Runa Simi)" },
      { code: "ay", name: "Aymara" },
      { code: "gn", name: "Guarani (Avañe'ẽ)" },
      { code: "mi", name: "Māori (Te Reo Māori)" },
      { code: "sm", name: "Samoan" },
      { code: "to", name: "Tongan (Lea Faka-Tonga)" },
      { code: "haw", name: "Hawaiian (ʻŌlelo Hawaiʻi)" },
      { code: "iu", name: "Inuktitut (ᐃᓄᒃᑎᑐᑦ)" },
      { code: "ypk", name: "Yupik" },
    ],
  },
];

/** Flat list (with the "Any language" option first) for legacy consumers. */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "auto", name: "Any language" },
  ...LANGUAGE_GROUPS.flatMap((g) => g.languages),
];

/** Split "Tamil (தமிழ்)" → ["Tamil", "தமிழ்"] for two-tone rendering. */
const splitName = (name: string): [string, string | null] => {
  const idx = name.indexOf(" (");
  if (idx === -1) return [name, null];
  return [name.slice(0, idx), name.slice(idx + 2).replace(/\)$/, "")];
};

const LanguageSelector = ({ value, onChange, open, onOpenChange, showTooltip = false, highlight = false }: LanguageSelectorProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [customLanguages, setCustomLanguages] = useState<LanguageOption[]>([]);
  const isControlled = open !== undefined;
  const isOpen = open ?? internalOpen;

  // Fetch admin-defined custom languages and append as their own section.
  useEffect(() => {
    const fetchCustomLanguages = async () => {
      try {
        const db = getFirebaseDb();
        if (!db) return;
        const querySnapshot = await getDocs(collection(db, "customLanguages"));
        const known = new Set(LANGUAGE_OPTIONS.map((l) => l.code));
        const customLangs = querySnapshot.docs
          .map((doc) => ({ code: String(doc.data().code), name: String(doc.data().name) }))
          .filter((l) => l.code && l.name && !known.has(l.code));
        setCustomLanguages(customLangs);
      } catch (error) {
        console.error("Error fetching custom languages:", error);
      }
    };
    fetchCustomLanguages();
  }, []);

  const groups = useMemo<LanguageGroup[]>(
    () =>
      customLanguages.length
        ? [...LANGUAGE_GROUPS, { label: "Custom", languages: customLanguages }]
        : LANGUAGE_GROUPS,
    [customLanguages]
  );

  const allLanguages = useMemo(
    () => [...LANGUAGE_OPTIONS, ...customLanguages],
    [customLanguages]
  );
  const selectedLanguage = allLanguages.find((lang) => lang.code === value);

  // "any" / "auto" / empty all mean "Any language"
  const isAutoMode = !value || value === "auto" || value === "any";
  const [buttonPrimary] = selectedLanguage ? splitName(selectedLanguage.name) : ["Any language"];
  const buttonLabel = !isAutoMode && selectedLanguage ? buttonPrimary : "Any language";

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    handleOpenChange(false);
  };

  const selector = (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          className={cn(
            "h-9 w-full sm:w-auto sm:min-w-[170px] max-w-[230px] justify-between gap-2 rounded-[10px] border-gray-200 bg-white pl-2.5 pr-2 text-[13px] font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50",
            isOpen && "border-primary/40 ring-2 ring-primary/10",
            highlight ? "blink-green-slow" : ""
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px]",
                isAutoMode
                  ? "bg-gradient-to-br from-blue-500 to-cyan-400 text-white"
                  : "bg-primary/10 text-primary"
              )}
            >
              <Globe className="h-3 w-3" />
            </span>
            <span className="truncate">{buttonLabel}</span>
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200", isOpen && "rotate-180")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-gray-200 p-0 shadow-xl sm:w-[320px]"
        align="start"
        side="bottom"
        sideOffset={8}
        avoidCollisions={false}
      >
        <Command>
          <CommandInput placeholder="Search 130+ languages…" className="h-11 text-[13px]" />
          <CommandList className="max-h-[min(55vh,420px)] overflow-y-auto overscroll-contain">
            <CommandEmpty>
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <Globe className="h-5 w-5 text-gray-300" />
                <p className="text-[13px] font-medium text-gray-600">No language found</p>
                <p className="text-xs text-gray-400">Try a different spelling</p>
              </div>
            </CommandEmpty>

            {/* Featured: Any language */}
            <CommandGroup>
              <CommandItem
                value="any language auto detect all default"
                onSelect={() => handleSelect("auto")}
                className={cn(
                  "mx-1 mt-1 cursor-pointer rounded-lg px-2.5 py-2.5",
                  isAutoMode && "bg-primary/5"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-sm">
                  <Globe className="h-4 w-4" />
                </span>
                <span className="ml-2.5 flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] font-semibold text-gray-900">Any language</span>
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    Smart — works for every language
                  </span>
                </span>
                {isAutoMode && <Check className="ml-2 h-4 w-4 shrink-0 text-primary" />}
              </CommandItem>
            </CommandGroup>

            {/* Region sections */}
            {groups.map((group) => (
              <CommandGroup
                key={group.label}
                heading={group.label}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-gray-400"
              >
                {group.languages.map((lang) => {
                  const [primary, native] = splitName(lang.name);
                  const isSelected = value === lang.code;
                  return (
                    <CommandItem
                      key={lang.code}
                      value={`${lang.name} ${lang.code}`}
                      onSelect={() => handleSelect(lang.code)}
                      className={cn(
                        "mx-1 cursor-pointer rounded-lg px-2.5 py-2",
                        isSelected && "bg-primary/5"
                      )}
                    >
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", isSelected ? "font-semibold text-primary" : "font-medium text-gray-700")}>
                        {primary}
                      </span>
                      {native && (
                        <span className="ml-2 max-w-[110px] shrink-0 truncate text-right text-[12px] text-gray-400" dir="auto">
                          {native}
                        </span>
                      )}
                      {isSelected && <Check className="ml-2 h-4 w-4 shrink-0 text-primary" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>

          {/* Footer */}
          <div className="flex items-center justify-center gap-1.5 border-t border-gray-100 bg-gray-50/70 px-3 py-2">
            <Globe className="h-3 w-3 text-gray-300" />
            <span className="text-[11px] font-medium text-gray-400">130+ languages supported</span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );

  // Show tooltip when language is not selected and user should select one
  if (showTooltip && !value) {
    return (
      <TooltipProvider>
        <Tooltip open={showTooltip}>
          <TooltipTrigger asChild>
            {selector}
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-accent text-accent-foreground">
            <p className="font-medium">Please select a language first</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return selector;
};

export default LanguageSelector;
