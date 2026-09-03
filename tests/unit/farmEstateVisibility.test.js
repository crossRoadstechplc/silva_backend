/**
 * Documents B-Agro portfolio visibility rules used in farmEstate.service and dashboard.
 */
const { BAGRO_FARMS, CHAKA_ESTATE } = require("../../lib/cropfortFieldOsImport");

function filterEstatesForSilva(estates, silvaOrgId) {
  return estates.filter((e) => e.ownerOrganizationId === silvaOrgId && e.status === "active");
}

function filterEstatesForVendor(estates, vendorId, vendorMapsByEstate) {
  return estates.filter(
    (e) =>
      e.status === "active" &&
      (vendorMapsByEstate[e.id] || []).some((m) => m.vendorId === vendorId),
  );
}

describe("farm estate visibility (B-Agro portfolio)", () => {
  const silvaOrgId = "org_silva";
  const bagroVendorId = "vnd_bagro";

  const portfolio = [
    ...BAGRO_FARMS.map((f) => ({
      id: f.id,
      name: f.name,
      ownerOrganizationId: null,
      status: "active",
    })),
    {
      id: CHAKA_ESTATE.id,
      name: CHAKA_ESTATE.name,
      ownerOrganizationId: silvaOrgId,
      status: "active",
    },
  ];

  const vendorMaps = Object.fromEntries(
    portfolio.map((e) => [e.id, [{ vendorId: bagroVendorId, isPrimary: true }]]),
  );

  it("Silva sees only Chaka Buna (owned estate)", () => {
    const visible = filterEstatesForSilva(portfolio, silvaOrgId);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("fest_chaka_buna");
  });

  it("B-Agro vendor sees all 7 active farms", () => {
    const visible = filterEstatesForVendor(portfolio, bagroVendorId, vendorMaps);
    expect(visible).toHaveLength(7);
    expect(visible.map((e) => e.id).sort()).toEqual(portfolio.map((e) => e.id).sort());
  });

  it("SPX without owner filter sees full portfolio", () => {
    expect(portfolio.filter((e) => e.status === "active")).toHaveLength(7);
  });
});
