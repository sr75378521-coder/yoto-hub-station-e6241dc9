import { useEffect, useState } from "react";
import {
  Lightbulb,
  Sun,
  Moon,
  RotateCcw,
  RefreshCw,
  Bluetooth,
  Headphones,
  Repeat,
  Power,
  ChevronDown,
  Volume2,
  Shuffle,
  Clock,
  Lock,
  BellRing,
  Music2,
  Type,
  Download,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { yotoDevice } from "@/lib/yoto/mqtt-client";
import { useYotoDevice } from "@/hooks/useYotoRealtime";

const COLORS: Array<{ name: string; rgb: [number, number, number]; css: string }> = [
  { name: "Red", rgb: [255, 40, 40], css: "bg-red-500" },
  { name: "Orange", rgb: [255, 140, 20], css: "bg-orange-500" },
  { name: "Yellow", rgb: [255, 220, 40], css: "bg-yellow-400" },
  { name: "Green", rgb: [60, 220, 90], css: "bg-green-500" },
  { name: "Teal", rgb: [40, 220, 210], css: "bg-teal-400" },
  { name: "Blue", rgb: [50, 120, 255], css: "bg-blue-500" },
  { name: "Purple", rgb: [160, 80, 255], css: "bg-purple-500" },
  { name: "Pink", rgb: [255, 90, 190], css: "bg-pink-500" },
  { name: "White", rgb: [255, 255, 255], css: "bg-white border border-border" },
];

interface Props {
  deviceId: string;
  disabled?: boolean;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
const flag = (v: unknown) => v === 1 || v === true || v === "1" || v === "true";

/** Extra player settings sent over MQTT (yoto.dev/players-mqtt). */
export function PlayerAdvanced({ deviceId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const { state } = useYotoDevice(deviceId, !disabled);
  const cfg = state?.config ?? null;

  const [dayBright, setDayBright] = useState(80);
  const [nightBright, setNightBright] = useState(20);
  const [maxDay, setMaxDay] = useState(16);
  const [maxNight, setMaxNight] = useState(8);
  const [bluetooth, setBluetooth] = useState(false);
  const [repeatAll, setRepeatAll] = useState(false);
  const [headphoneLimit, setHeadphoneLimit] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [clock, setClock] = useState(true);
  const [clock24, setClock24] = useState(false);
  const [buttonSounds, setButtonSounds] = useState(true);
  const [buttonLock, setButtonLock] = useState(false);
  const [alarms, setAlarms] = useState(true);
  const [pauseOnUnplug, setPauseOnUnplug] = useState(true);
  const [ambientOffMin, setAmbientOffMin] = useState(0);
  const [dayTime, setDayTime] = useState("07:00");
  const [nightTime, setNightTime] = useState("19:00");
  const [displayText, setDisplayText] = useState("");
  const [hexColor, setHexColor] = useState("#ff2d55");

  // Mirror whatever the player actually reports, so switches aren't guesses.
  useEffect(() => {
    if (!cfg) return;
    setDayBright(num(cfg["displayDimBrightness"] ?? cfg["day"]?.displayBrightness, dayBright));
    setNightBright(
      num(cfg["nightDisplayBrightness"] ?? cfg["night"]?.displayBrightness, nightBright),
    );
    setMaxDay(num(cfg["maxVolumeLimit"] ?? cfg["day"]?.maxVolume, maxDay));
    setMaxNight(num(cfg["night"]?.maxVolume, maxNight));
    setBluetooth(flag(cfg["bluetoothEnabled"]));
    setRepeatAll(flag(cfg["repeatAll"]));
    setHeadphoneLimit(flag(cfg["headphonesVolumeLimited"]));
    setShuffle(flag(cfg["shuffle"]));
    setClock(cfg["clockFace"] ? cfg["clockFace"] !== "off" : clock);
    setClock24(cfg["hourFormat"] ? String(cfg["hourFormat"]) === "24" : clock24);
    setButtonSounds(cfg["buttonSounds"] == null ? buttonSounds : flag(cfg["buttonSounds"]));
    setButtonLock(flag(cfg["buttonLock"]));
    setAlarms(cfg["alarmsEnabled"] == null ? alarms : flag(cfg["alarmsEnabled"]));
    setPauseOnUnplug(
      cfg["pauseOnHeadphoneRemoval"] == null ? pauseOnUnplug : flag(cfg["pauseOnHeadphoneRemoval"]),
    );
    if (typeof cfg["ambientColourTimeout"] === "number") {
      setAmbientOffMin(Math.round(cfg["ambientColourTimeout"] / 60));
    }
    if (typeof cfg["dayTime"] === "string") setDayTime(cfg["dayTime"]);
    if (typeof cfg["nightTime"] === "string") setNightTime(cfg["nightTime"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  const run = (p: Promise<unknown>, msg: string) => {
    void p
      .then(() => toast.success(msg))
      .catch((e) => toast.error(`${msg} failed: ${e instanceof Error ? e.message : "error"}`));
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && !disabled) void yotoDevice.requestConfig(deviceId).catch(() => {});
        }}
        className="flex w-full items-center justify-between text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <Lightbulb className="size-4 text-primary" /> More player controls
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {/* Device info */}
          {(state?.wifiStrength != null || state?.firmware) && (
            <div className="flex flex-wrap gap-2">
              {state?.wifiStrength != null && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Wifi className="size-3" /> Wi-Fi {state.wifiStrength}
                </Badge>
              )}
              {state?.firmware && (
                <Badge variant="secondary" className="text-[10px]">
                  Firmware {state.firmware}
                </Badge>
              )}
            </div>
          )}

          {/* Night light */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Night light</p>
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  disabled={disabled}
                  aria-label={`Night light ${c.name}`}
                  onClick={() =>
                    run(
                      yotoDevice.setAmbient(deviceId, c.rgb[0], c.rgb[1], c.rgb[2]),
                      `Night light ${c.name.toLowerCase()}`,
                    )
                  }
                  className={cn(
                    "size-7 rounded-full shadow-sm transition hover:scale-110 disabled:opacity-50",
                    c.css,
                  )}
                />
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => run(yotoDevice.ambientOff(deviceId), "Night light off")}
              >
                Off
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={hexColor}
                disabled={disabled}
                onChange={(e) => setHexColor(e.target.value)}
                aria-label="Pick a custom night light colour"
                className="size-8 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => run(yotoDevice.setAmbientHex(deviceId, hexColor), "Custom colour set")}
              >
                Use colour
              </Button>
              <LimitPicker
                label="Auto-off (min)"
                value={ambientOffMin}
                max={120}
                step={10}
                disabled={disabled}
                onChange={(v) => {
                  setAmbientOffMin(v);
                  run(yotoDevice.setAmbientTimeout(deviceId, v), "Night light auto-off saved");
                }}
              />
            </div>
          </div>

          {/* Brightness */}
          <div className="grid gap-3 sm:grid-cols-2">
            <BrightnessRow
              icon={<Sun className="size-4 text-yellow-500" />}
              label="Day brightness"
              value={dayBright}
              onChange={setDayBright}
              disabled={disabled}
              onCommit={(v) => run(yotoDevice.setDayBrightness(deviceId, v), "Day brightness set")}
            />
            <BrightnessRow
              icon={<Moon className="size-4 text-indigo-400" />}
              label="Night brightness"
              value={nightBright}
              onChange={setNightBright}
              disabled={disabled}
              onCommit={(v) =>
                run(yotoDevice.setNightBrightness(deviceId, v), "Night brightness set")
              }
            />
          </div>

          {/* Max volume limits */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Volume2 className="size-3.5" /> Volume limits (0–16)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <LimitPicker label="Day" value={maxDay} onChange={setMaxDay} disabled={disabled} />
              <LimitPicker
                label="Night"
                value={maxNight}
                onChange={setMaxNight}
                disabled={disabled}
              />
              <Button
                size="sm"
                disabled={disabled}
                onClick={() => run(yotoDevice.setMaxVolume(deviceId, maxDay, maxNight), "Volume limits saved")}
              >
                Save limits
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => run(yotoDevice.volumeDown(deviceId), "Volume down")}
              >
                Vol −
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => run(yotoDevice.volumeUp(deviceId), "Volume up")}
              >
                Vol +
              </Button>
            </div>
          </div>

          {/* Day / night schedule */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Clock className="size-3.5" /> Day / night schedule
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                value={dayTime}
                disabled={disabled}
                aria-label="Day mode starts"
                onChange={(e) => setDayTime(e.target.value)}
                className="w-28"
              />
              <Input
                type="time"
                value={nightTime}
                disabled={disabled}
                aria-label="Night mode starts"
                onChange={(e) => setNightTime(e.target.value)}
                className="w-28"
              />
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  run(yotoDevice.setDayNightTimes(deviceId, dayTime, nightTime), "Schedule saved")
                }
              >
                Save times
              </Button>
            </div>
          </div>

          {/* Display message */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Type className="size-3.5" /> Show a message on the player
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={displayText}
                disabled={disabled}
                placeholder="Bedtime!"
                maxLength={40}
                onChange={(e) => setDisplayText(e.target.value)}
                className="w-48"
              />
              <Button
                size="sm"
                disabled={disabled || !displayText.trim()}
                onClick={() => run(yotoDevice.showText(deviceId, displayText.trim(), 8), "Message sent")}
              >
                Send
              </Button>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <ToggleRow
              icon={<Bluetooth className="size-4" />}
              label="Bluetooth"
              checked={bluetooth}
              disabled={disabled}
              onChange={(v) => {
                setBluetooth(v);
                run(yotoDevice.setBluetooth(deviceId, v), `Bluetooth ${v ? "on" : "off"}`);
              }}
            />
            <ToggleRow
              icon={<Repeat className="size-4" />}
              label="Repeat all"
              checked={repeatAll}
              disabled={disabled}
              onChange={(v) => {
                setRepeatAll(v);
                run(yotoDevice.setRepeatAll(deviceId, v), `Repeat ${v ? "on" : "off"}`);
              }}
            />
            <ToggleRow
              icon={<Shuffle className="size-4" />}
              label="Shuffle tracks"
              checked={shuffle}
              disabled={disabled}
              onChange={(v) => {
                setShuffle(v);
                run(yotoDevice.setShuffle(deviceId, v), `Shuffle ${v ? "on" : "off"}`);
              }}
            />
            <ToggleRow
              icon={<Headphones className="size-4" />}
              label="Limit headphone volume"
              checked={headphoneLimit}
              disabled={disabled}
              onChange={(v) => {
                setHeadphoneLimit(v);
                run(
                  yotoDevice.setHeadphonesVolumeLimited(deviceId, v),
                  `Headphone limit ${v ? "on" : "off"}`,
                );
              }}
            />
            <ToggleRow
              icon={<Headphones className="size-4" />}
              label="Pause when headphones unplugged"
              checked={pauseOnUnplug}
              disabled={disabled}
              onChange={(v) => {
                setPauseOnUnplug(v);
                run(
                  yotoDevice.setPauseOnHeadphonesUnplug(deviceId, v),
                  `Auto-pause ${v ? "on" : "off"}`,
                );
              }}
            />
            <ToggleRow
              icon={<Clock className="size-4" />}
              label="Show clock when idle"
              checked={clock}
              disabled={disabled}
              onChange={(v) => {
                setClock(v);
                run(yotoDevice.setClock(deviceId, v), `Clock ${v ? "on" : "off"}`);
              }}
            />
            <ToggleRow
              icon={<Clock className="size-4" />}
              label="24-hour clock"
              checked={clock24}
              disabled={disabled}
              onChange={(v) => {
                setClock24(v);
                run(yotoDevice.setClock24Hour(deviceId, v), `${v ? "24" : "12"}-hour clock`);
              }}
            />
            <ToggleRow
              icon={<BellRing className="size-4" />}
              label="Alarms enabled"
              checked={alarms}
              disabled={disabled}
              onChange={(v) => {
                setAlarms(v);
                run(yotoDevice.setAlarmsEnabled(deviceId, v), `Alarms ${v ? "on" : "off"}`);
              }}
            />
            <ToggleRow
              icon={<Music2 className="size-4" />}
              label="Button sounds"
              checked={buttonSounds}
              disabled={disabled}
              onChange={(v) => {
                setButtonSounds(v);
                run(yotoDevice.setButtonSounds(deviceId, v), `Button sounds ${v ? "on" : "off"}`);
              }}
            />
            <ToggleRow
              icon={<Lock className="size-4" />}
              label="Lock the buttons"
              checked={buttonLock}
              disabled={disabled}
              onChange={(v) => {
                setButtonLock(v);
                run(yotoDevice.setButtonLock(deviceId, v), `Buttons ${v ? "locked" : "unlocked"}`);
              }}
            />
          </div>

          {/* Power / maintenance */}
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={disabled} className="gap-1.5">
                  <Power className="size-3.5" /> Auto power off
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {[5, 10, 20, 30, 60].map((m) => (
                  <DropdownMenuItem
                    key={m}
                    onClick={() =>
                      run(yotoDevice.setShutdownTimer(deviceId, m), `Power off after ${m} min`)
                    }
                  >
                    {m} minutes
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => run(yotoDevice.cancelSleepTimer(deviceId), "Sleep timer cancelled")}
            >
              <Moon className="size-3.5" /> Cancel sleep timer
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                run(
                  yotoDevice.setTimezone(deviceId, -new Date().getTimezoneOffset()),
                  "Timezone synced",
                )
              }
            >
              <Clock className="size-3.5" /> Sync timezone
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => run(yotoDevice.checkForUpdate(deviceId), "Checking for updates")}
            >
              <Download className="size-3.5" /> Check for update
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                run(yotoDevice.requestStatus(deviceId), "Refreshed");
                void yotoDevice.requestEvents(deviceId).catch(() => {});
                void yotoDevice.requestConfig(deviceId).catch(() => {});
              }}
            >
              <RefreshCw className="size-3.5" /> Refresh
            </Button>

            <Button
              size="sm"
              variant="destructive"
              disabled={disabled}
              onClick={() => run(yotoDevice.reboot(deviceId), "Restarting player")}
            >
              <RotateCcw className="size-3.5" /> Restart player
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BrightnessRow({
  icon,
  label,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon} {label} · {value}%
      </p>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={5}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        onValueCommit={(v) => onCommit(v[0] ?? 0)}
      />
    </div>
  );
}

function LimitPicker({
  label,
  value,
  onChange,
  disabled,
  max = 16,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  max?: number;
  step?: number;
}) {
  const options = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          {label}: {value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {options.map((i) => (
          <DropdownMenuItem key={i} onClick={() => onChange(i)}>
            {i}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon} {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}
