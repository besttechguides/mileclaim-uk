/**
 * MileClaim UK — browser-local HMRC mileage trip log + AMAP / MAR calculator
 * Rates verified against GOV.UK (Travel — mileage and fuel rates and allowances), updated 21 May 2026.
 * Not tax advice.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "mileclaim-uk-v1";
  var THRESHOLD = 10000;

  /** Official AMAP rates (pence). Source: GOV.UK. */
  var RATES = {
    "2026-27": {
      label: "2026 to 2027",
      from: "2026-04-06",
      to: "2027-04-05",
      car: { first: 55, after: 25, threshold: THRESHOLD },
      motorcycle: { first: 24, after: 24, threshold: THRESHOLD },
      bicycle: { first: 20, after: 20, threshold: THRESHOLD },
      passenger: 5,
      verified: true
    },
    "2025-26": {
      label: "2025 to 2026",
      from: "2025-04-06",
      to: "2026-04-05",
      car: { first: 45, after: 25, threshold: THRESHOLD },
      motorcycle: { first: 24, after: 24, threshold: THRESHOLD },
      bicycle: { first: 20, after: 20, threshold: THRESHOLD },
      passenger: 5,
      verified: true
    }
  };

  var VEHICLE_LABELS = {
    car: "Cars and vans",
    motorcycle: "Motorcycles",
    bicycle: "Bicycles"
  };

  var state = {
    taxYear: "2026-27",
    vehicleType: "car",
    employerRate: 0,
    trips: []
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function money(n) {
    return "£" + (Math.round(n * 100) / 100).toFixed(2);
  }

  function penceLabel(p) {
    return p + "p";
  }

  function uid() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.taxYear && RATES[data.taxYear]) state.taxYear = data.taxYear;
      if (data.vehicleType && VEHICLE_LABELS[data.vehicleType]) state.vehicleType = data.vehicleType;
      if (typeof data.employerRate === "number" && data.employerRate >= 0) {
        state.employerRate = data.employerRate;
      }
      if (Array.isArray(data.trips)) {
        state.trips = data.trips.filter(function (t) {
          return t && typeof t.miles === "number" && t.miles > 0 && t.date;
        });
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          taxYear: state.taxYear,
          vehicleType: state.vehicleType,
          employerRate: state.employerRate,
          trips: state.trips
        })
      );
    } catch (e) {
      /* quota / private mode */
    }
  }

  function yearRates() {
    return RATES[state.taxYear];
  }

  function vehicleRates() {
    return yearRates()[state.vehicleType];
  }

  /** Trips for the selected tax year only, sorted by date ascending. */
  function tripsForYear() {
    var yr = yearRates();
    return state.trips
      .filter(function (t) {
        return t.date >= yr.from && t.date <= yr.to;
      })
      .slice()
      .sort(function (a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return (a.created || 0) - (b.created || 0);
      });
  }

  /**
   * Allocate AMAP allowance across miles in date order, flipping at 10k for cars/vans.
   * Returns { totalMiles, amapPounds, milesAtFirst, milesAtAfter, bandDetail }
   * MAR uses vehicle AMAP only (not passenger).
   */
  function computeAllowance(trips) {
    var vr = vehicleRates();
    var remainingFirst = vr.threshold;
    var milesAtFirst = 0;
    var milesAtAfter = 0;
    var amapPence = 0;
    var perTrip = [];

    trips.forEach(function (t) {
      var miles = t.miles;
      var firstPart = Math.min(miles, Math.max(0, remainingFirst));
      var afterPart = miles - firstPart;
      remainingFirst -= firstPart;
      milesAtFirst += firstPart;
      milesAtAfter += afterPart;
      var tripAmapPence = firstPart * vr.first + afterPart * vr.after;
      amapPence += tripAmapPence;

      var passPence = 0;
      if (state.vehicleType === "car" && t.passengers > 0) {
        passPence = t.miles * t.passengers * yearRates().passenger;
      }

      perTrip.push({
        id: t.id,
        amapPounds: tripAmapPence / 100,
        passengerPounds: passPence / 100,
        firstPart: firstPart,
        afterPart: afterPart
      });
    });

    return {
      totalMiles: milesAtFirst + milesAtAfter,
      amapPounds: amapPence / 100,
      milesAtFirst: milesAtFirst,
      milesAtAfter: milesAtAfter,
      rateFirst: vr.first,
      rateAfter: vr.after,
      perTrip: perTrip
    };
  }

  /**
   * MAR shortfall: (AMAP rate − employer rate) × miles, only where employer < AMAP for that band.
   * Applied mile-by-mile with threshold flip. Passenger payments excluded from MAR.
   */
  function computeMar(allowance) {
    var employer = state.employerRate; /* pence */
    var shortfallPence = 0;
    var milesFirst = allowance.milesAtFirst;
    var milesAfter = allowance.milesAtAfter;
    var rFirst = allowance.rateFirst;
    var rAfter = allowance.rateAfter;

    if (employer < rFirst && milesFirst > 0) {
      shortfallPence += (rFirst - employer) * milesFirst;
    }
    if (employer < rAfter && milesAfter > 0) {
      shortfallPence += (rAfter - employer) * milesAfter;
    }

    var marPounds = shortfallPence / 100;
    return {
      marPounds: marPounds,
      estimate20: marPounds * 0.2,
      estimate40: marPounds * 0.4,
      estimate45: marPounds * 0.45,
      employerBelow: employer < rFirst || (milesAfter > 0 && employer < rAfter)
    };
  }

  function renderRates() {
    var yr = yearRates();
    var vr = vehicleRates();
    var html =
      "<h3>Approved rates — " +
      escapeHtml(VEHICLE_LABELS[state.vehicleType]) +
      " (" +
      escapeHtml(yr.label) +
      ")</h3><ul>";

    if (vr.first === vr.after) {
      html +=
        "<li><strong>" +
        penceLabel(vr.first) +
        "</strong> per business mile (all miles)</li>";
    } else {
      html +=
        "<li><strong>" +
        penceLabel(vr.first) +
        "</strong> per mile for the first " +
        vr.threshold.toLocaleString("en-GB") +
        " business miles</li>";
      html +=
        "<li><strong>" +
        penceLabel(vr.after) +
        "</strong> per mile thereafter</li>";
    }

    if (state.vehicleType === "car") {
      html +=
        "<li>Passenger payments (cars/vans): <strong>+" +
        penceLabel(yr.passenger) +
        "</strong> per passenger per business mile (employer exemption only — no MAR if unpaid)</li>";
    }

    html += "</ul>";
    html +=
      '<p class="source">Source: GOV.UK Travel — mileage and fuel rates and allowances (verified). Always re-check before claiming.</p>';
    els.ratesCard.innerHTML = html;

    var showPass = state.vehicleType === "car";
    els.passengersField.hidden = !showPass;
    els.passengersCol.hidden = !showPass;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTotals() {
    var trips = tripsForYear();
    var allowance = computeAllowance(trips);
    var mar = computeMar(allowance);
    var rateNote;
    if (allowance.milesAtAfter > 0 && allowance.rateFirst !== allowance.rateAfter) {
      rateNote =
        penceLabel(allowance.rateFirst) +
        " × " +
        formatMiles(allowance.milesAtFirst) +
        " + " +
        penceLabel(allowance.rateAfter) +
        " × " +
        formatMiles(allowance.milesAtAfter);
    } else {
      rateNote = penceLabel(allowance.rateFirst) + " throughout";
    }

    var html = "";
    html += stat("Business miles (YTD)", formatMiles(allowance.totalMiles), rateNote);
    html += stat(
      "AMAP allowance",
      money(allowance.amapPounds),
      "Approved amount for these miles",
      "accent"
    );
    html += stat(
      "Employer rate",
      state.employerRate > 0 ? penceLabel(state.employerRate) + "/mile" : "Not set / unpaid",
      "Compared against AMAP for MAR"
    );

    if (allowance.totalMiles > 0) {
      html += stat(
        "MAR shortfall",
        money(mar.marPounds),
        mar.marPounds > 0
          ? "AMAP minus employer rate × miles (vehicle only)"
          : "No shortfall at current employer rate",
        mar.marPounds > 0 ? "warn" : ""
      );
      html += stat(
        "Relief estimate @ 20%",
        money(mar.estimate20),
        "Illustrative only — not advice"
      );
      html += stat(
        "Relief estimate @ 40% / 45%",
        money(mar.estimate40) + " / " + money(mar.estimate45),
        "Depends on your marginal rate — verify with HMRC / adviser"
      );
    }

    els.totalsGrid.innerHTML = html;
  }

  function stat(label, value, note, mod) {
    var cls = "stat" + (mod ? " stat--" + mod : "");
    return (
      '<div class="' +
      cls +
      '"><span class="stat__label">' +
      escapeHtml(label) +
      '</span><span class="stat__value">' +
      escapeHtml(value) +
      "</span>" +
      (note
        ? '<span class="stat__note">' + escapeHtml(note) + "</span>"
        : "") +
      "</div>"
    );
  }

  function formatMiles(n) {
    return (Math.round(n * 10) / 10).toLocaleString("en-GB", {
      maximumFractionDigits: 1
    });
  }

  function formatDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function renderTable() {
    var trips = tripsForYear();
    var allowance = computeAllowance(trips);
    var byId = {};
    allowance.perTrip.forEach(function (p) {
      byId[p.id] = p;
    });

    els.tripBody.innerHTML = "";
    if (trips.length === 0) {
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;

    var showPass = state.vehicleType === "car";
    /* newest first for display */
    var display = trips.slice().reverse();

    display.forEach(function (t) {
      var calc = byId[t.id] || { amapPounds: 0 };
      var tr = document.createElement("tr");
      var passCell = showPass
        ? '<td class="num">' + (t.passengers || 0) + "</td>"
        : '<td class="num" hidden></td>';
      tr.innerHTML =
        "<td>" +
        escapeHtml(formatDate(t.date)) +
        "</td><td>" +
        escapeHtml(t.from || "—") +
        "</td><td>" +
        escapeHtml(t.to || "—") +
        "</td><td>" +
        escapeHtml(t.purpose || "") +
        '</td><td class="num">' +
        escapeHtml(formatMiles(t.miles)) +
        "</td>" +
        passCell +
        '<td class="num">' +
        escapeHtml(money(calc.amapPounds)) +
        '</td><td class="no-print"><button type="button" class="btn btn--small btn--danger" data-delete="' +
        escapeHtml(t.id) +
        '">Delete</button></td>';
      els.tripBody.appendChild(tr);
    });
  }

  function refresh() {
    renderRates();
    renderTotals();
    renderTable();
  }

  function defaultTripDate() {
    var yr = yearRates();
    var today = new Date();
    var iso = today.toISOString().slice(0, 10);
    if (iso < yr.from) return yr.from;
    if (iso > yr.to) return yr.to;
    return iso;
  }

  function onAddTrip(e) {
    e.preventDefault();
    var date = els.tripDate.value;
    var miles = parseFloat(els.tripMiles.value, 10);
    var purpose = (els.tripPurpose.value || "").trim();
    var from = (els.tripFrom.value || "").trim();
    var to = (els.tripTo.value || "").trim();
    var passengers = parseInt(els.tripPassengers.value, 10) || 0;

    if (!date || !purpose || !(miles > 0)) {
      els.tripMiles.focus();
      return;
    }

    var yr = yearRates();
    if (date < yr.from || date > yr.to) {
      window.alert(
        "Trip date should fall within tax year " +
          yr.label +
          " (" +
          formatDate(yr.from) +
          " – " +
          formatDate(yr.to) +
          ")."
      );
      return;
    }

    if (state.vehicleType !== "car") passengers = 0;

    state.trips.push({
      id: uid(),
      date: date,
      from: from,
      to: to,
      purpose: purpose,
      miles: Math.round(miles * 10) / 10,
      passengers: Math.max(0, passengers),
      vehicleType: state.vehicleType,
      created: Date.now()
    });
    save();
    els.tripForm.reset();
    els.tripDate.value = defaultTripDate();
    els.tripPassengers.value = "0";
    refresh();
  }

  function onDelete(id) {
    state.trips = state.trips.filter(function (t) {
      return t.id !== id;
    });
    save();
    refresh();
  }

  function onClearAll() {
    var n = tripsForYear().length;
    if (n === 0) return;
    if (
      !window.confirm(
        "Delete all " + n + " trip(s) for tax year " + yearRates().label + "?"
      )
    ) {
      return;
    }
    var yr = yearRates();
    state.trips = state.trips.filter(function (t) {
      return !(t.date >= yr.from && t.date <= yr.to);
    });
    save();
    refresh();
  }

  function downloadCsv() {
    var trips = tripsForYear();
    var allowance = computeAllowance(trips);
    var mar = computeMar(allowance);
    var byId = {};
    allowance.perTrip.forEach(function (p) {
      byId[p.id] = p;
    });

    var lines = [];
    lines.push("MileClaim UK export");
    lines.push("Tax year," + csvEscape(yearRates().label));
    lines.push("Vehicle," + csvEscape(VEHICLE_LABELS[state.vehicleType]));
    lines.push("Employer rate (p/mile)," + state.employerRate);
    lines.push("Total business miles," + allowance.totalMiles);
    lines.push("AMAP allowance (£)," + allowance.amapPounds.toFixed(2));
    lines.push("MAR shortfall (£)," + mar.marPounds.toFixed(2));
    lines.push("Relief estimate 20% (£)," + mar.estimate20.toFixed(2));
    lines.push("Relief estimate 40% (£)," + mar.estimate40.toFixed(2));
    lines.push("Relief estimate 45% (£)," + mar.estimate45.toFixed(2));
    lines.push("");
    lines.push(
      "Date,From,To,Purpose,Miles,Passengers,AMAP £,Notes"
    );

    trips.forEach(function (t) {
      var calc = byId[t.id] || { amapPounds: 0 };
      lines.push(
        [
          t.date,
          csvEscape(t.from),
          csvEscape(t.to),
          csvEscape(t.purpose),
          t.miles,
          t.passengers || 0,
          calc.amapPounds.toFixed(2),
          ""
        ].join(",")
      );
    });

    lines.push("");
    lines.push(
      "Disclaimer,Not tax advice. Verify rates on GOV.UK before claiming."
    );

    var blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8"
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download =
      "mileclaim-uk-" + state.taxYear + "-" + state.vehicleType + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function csvEscape(v) {
    var s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function bind() {
    els.taxYear = $("taxYear");
    els.vehicleType = $("vehicleType");
    els.employerRate = $("employerRate");
    els.ratesCard = $("ratesCard");
    els.totalsGrid = $("totalsGrid");
    els.tripForm = $("trip-form");
    els.tripDate = $("tripDate");
    els.tripMiles = $("tripMiles");
    els.tripFrom = $("tripFrom");
    els.tripTo = $("tripTo");
    els.tripPurpose = $("tripPurpose");
    els.tripPassengers = $("tripPassengers");
    els.passengersField = $("passengersField");
    els.passengersCol = $("passengersCol");
    els.tripBody = $("tripBody");
    els.emptyState = $("emptyState");
    els.btnCsv = $("btnCsv");
    els.btnPrint = $("btnPrint");
    els.btnClear = $("btnClear");

    els.taxYear.value = state.taxYear;
    els.vehicleType.value = state.vehicleType;
    els.employerRate.value =
      state.employerRate > 0 ? String(state.employerRate) : "";
    els.tripDate.value = defaultTripDate();

    els.taxYear.addEventListener("change", function () {
      state.taxYear = els.taxYear.value;
      save();
      els.tripDate.value = defaultTripDate();
      refresh();
    });

    els.vehicleType.addEventListener("change", function () {
      state.vehicleType = els.vehicleType.value;
      save();
      refresh();
    });

    els.employerRate.addEventListener("input", function () {
      var v = parseFloat(els.employerRate.value, 10);
      state.employerRate = isFinite(v) && v >= 0 ? v : 0;
      save();
      renderTotals();
    });

    els.tripForm.addEventListener("submit", onAddTrip);

    els.tripBody.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-delete]");
      if (!btn) return;
      onDelete(btn.getAttribute("data-delete"));
    });

    els.btnCsv.addEventListener("click", downloadCsv);
    els.btnPrint.addEventListener("click", function () {
      window.print();
    });
    els.btnClear.addEventListener("click", onClearAll);

  }

  function init() {
    load();
    bind();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
