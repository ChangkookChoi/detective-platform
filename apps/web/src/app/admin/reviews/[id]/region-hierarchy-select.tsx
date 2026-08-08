"use client";

import { useId, useState } from "react";

type RegionOption = {
  slug: string;
  label: string;
};

type RegionGroup = {
  slug: string;
  name: string;
  regions: RegionOption[];
};

export function RegionHierarchySelect({
  groups,
}: {
  groups: RegionGroup[];
}) {
  const provinceId = useId();
  const regionId = useId();
  const hintId = useId();
  const [provinceSlug, setProvinceSlug] = useState("");
  const [regionSlug, setRegionSlug] = useState("");
  const selectedGroup = groups.find((group) => group.slug === provinceSlug);

  return (
    <fieldset className="grid gap-4 rounded-lg border border-slate-300 p-4 md:col-span-2 md:grid-cols-2">
      <legend className="px-2 text-sm font-bold">소재 지역</legend>
      <label htmlFor={provinceId} className="grid gap-2 text-sm font-bold">
        시·도
        <select
          id={provinceId}
          required
          value={provinceSlug}
          onChange={(event) => {
            setProvinceSlug(event.target.value);
            setRegionSlug("");
          }}
          className="rounded-lg border border-slate-300 bg-white p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
        >
          <option value="" disabled>
            시·도 선택
          </option>
          {groups.map((group) => (
            <option key={group.slug} value={group.slug}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={regionId} className="grid gap-2 text-sm font-bold">
        시·군·구
        <select
          id={regionId}
          name="regionSlug"
          required
          disabled={!selectedGroup}
          value={regionSlug}
          onChange={(event) => setRegionSlug(event.target.value)}
          aria-describedby={hintId}
          className="rounded-lg border border-slate-300 bg-white p-3 font-normal outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
        >
          <option value="" disabled>
            {selectedGroup ? "시·군·구 선택" : "시·도를 먼저 선택하세요"}
          </option>
          {(selectedGroup?.regions ?? []).map((region) => (
            <option key={region.slug} value={region.slug}>
              {region.label}
            </option>
          ))}
        </select>
      </label>
      <p id={hintId} className="text-xs leading-5 text-slate-500 md:col-span-2">
        검수된 실제 사무소 소재지를 선택하세요. 경기도의 일반구는
        &quot;시 / 구&quot;로 표시합니다.
      </p>
    </fieldset>
  );
}
