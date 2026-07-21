(function () {
  var svgNS = "http://www.w3.org/2000/svg";
  var colors = [
    getComputedStyle(document.documentElement).getPropertyValue("--orange").trim() || "#ea7a1c",
    getComputedStyle(document.documentElement).getPropertyValue("--teal-bright").trim() || "#14a89b",
    getComputedStyle(document.documentElement).getPropertyValue("--flag-gold").trim() || "#f0b429",
  ];

  function buildBunting(id) {
    var host = document.getElementById(id);
    if (!host) return;
    var count = 26;
    var unit = 30;
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + count * unit + " 34");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "34");
    svg.setAttribute("role", "presentation");

    var line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "3");
    line.setAttribute("x2", String(count * unit));
    line.setAttribute("y2", "3");
    line.setAttribute("stroke", "rgba(255,255,255,0.35)");
    line.setAttribute("stroke-width", "2");
    svg.appendChild(line);

    for (var i = 0; i < count; i++) {
      var x = i * unit;
      var tri = document.createElementNS(svgNS, "polygon");
      tri.setAttribute(
        "points",
        (x + 3) + ",4 " + (x + unit - 3) + ",4 " + (x + unit / 2) + ",30"
      );
      tri.style.fill = colors[i % colors.length];
      svg.appendChild(tri);
    }

    host.appendChild(svg);
  }

  buildBunting("bunting");
  buildBunting("bunting2");
})();
