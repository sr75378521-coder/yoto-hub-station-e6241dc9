import { useState } from "react";
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { yotoDevice } from "@/lib/yoto/mqtt-client";

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

/** Extra player settings sent over MQTT (yoto.dev/players-mqtt). */
export function PlayerAdvanced({ deviceId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [dayBright, setDayBright] = useState(80);
  const [nightBright, setNightBright] = useState(20);
  const [maxDay, setMaxDay] = useState(16);
  const [maxNight, setMaxNight] = useState(8);
  const [bluetooth, setBluetooth] = useState(false);
  const [repeatAll, setRepeatAll] = useState(false);
  const [headphoneLimit, setHeadphoneLimit] = useState(false);

  const run = (p: Promise<unknown>, msg: string) => {
    void p
      .then(() => toast.success(msg))
      .catch((e) => toast.error(`${msg} failed: ${e instanceof Error ? e.message : "error"}`));
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <Lightbulb className="size-4 text-primary" /> More player controls
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-3 space-y-4">
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
              onClick={() => {
                run(yotoDevice.requestStatus(deviceId), "Refreshed");
                void yotoDevice.requestEvents(deviceId).catch(() => {});
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          {label}: {value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {Array.from({ length: 17 }, (_, i) => (
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
