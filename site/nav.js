function initHeader() {
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';

  var slides = [
    { src: 'images/ilona_hakonshallen1.jpg', alt: 'Ilona Håkonshallenissa' },
    { src: 'images/ilona_nyky21.jpg', alt: 'Ilona-kuoro', pos: 'center 72%' },
    { src: 'images/kevc3a4tkonsertti-2018.jpg', alt: 'Kevätkonsertti 2018', pos: 'center 27%' },
    { src: 'images/ilona_muuri.jpg', alt: 'Naiskuoro Ilona', pos: 'center 44%' },
  ];

  var pages = [
    { href: 'index.html', label: 'Etusivu' },
    { href: 'konsertit.html', label: 'Konsertit' },
    { href: 'kuoronjohtaja.html', label: 'Kuoronjohtaja' },
    { href: 'laulajaksi.html', label: 'Laulajaksi' },
    { href: 'ohjelmisto.html', label: 'Ohjelmisto' },
    { href: 'tilaa-laulua.html', label: 'Tilaa laulua' },
    { href: 'yhteystiedot.html', label: 'Yhteystiedot' },
  ];

  var header = document.getElementById('header');
  if (!header) return;

  // Build hero
  var slidesHtml = slides.map(function(s) {
    var style = s.pos ? ' style="object-position: ' + s.pos + '"' : '';
    return '<div class="carousel-slide"><img src="' + s.src + '" alt="' + s.alt + '"' + style + '></div>';
  }).join('');

  // Build nav
  var navHtml = pages.map(function(p) {
    var cls = 'page_item' + (p.href === currentPage ? ' current_page_item' : '');
    return '<li class="' + cls + '"><a href="' + p.href + '">' + p.label + '</a></li>';
  }).join('');

  header.innerHTML =
    '<div class="hero">' +
      '<div class="hero-logo">' +
        '<img src="images/ilona_logo.svg" alt="Naiskuoro Ilona">' +
      '</div>' +
      '<div class="carousel" id="carousel">' +
        '<div class="carousel-track" id="carouselTrack">' + slidesHtml + '</div>' +
        '<button class="carousel-btn prev" id="carouselPrev">&#8249;</button>' +
        '<button class="carousel-btn next" id="carouselNext">&#8250;</button>' +
        '<div class="carousel-dots" id="carouselDots"></div>' +
      '</div>' +
    '</div>' +
    '<div id="nav"><ul class="menu">' + navHtml + '</ul></div>';

  // Init carousel
  var track = document.getElementById('carouselTrack');
  var allSlides = track.querySelectorAll('.carousel-slide');
  var dotsContainer = document.getElementById('carouselDots');
  var total = allSlides.length;
  var saved = parseInt(localStorage.getItem('carouselSlide'), 10);
  var current = (saved >= 0 && saved < total) ? saved : 0;
  var autoTimer;

  allSlides.forEach(function(_, i) {
    var dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === current ? ' active' : '');
    dot.addEventListener('click', function() { goTo(i); });
    dotsContainer.appendChild(dot);
  });

  // Set initial position without transition
  track.style.transition = 'none';
  track.style.transform = 'translateX(-' + (current * 100) + '%)';
  // Force reflow then restore transition
  track.offsetHeight;
  track.style.transition = '';

  function goTo(index) {
    current = ((index % total) + total) % total;
    track.style.transform = 'translateX(-' + (current * 100) + '%)';
    localStorage.setItem('carouselSlide', current);
    dotsContainer.querySelectorAll('.carousel-dot').forEach(function(d, i) {
      d.classList.toggle('active', i === current);
    });
    resetAuto();
  }

  document.getElementById('carouselPrev').addEventListener('click', function() { goTo(current - 1); });
  document.getElementById('carouselNext').addEventListener('click', function() { goTo(current + 1); });

  function resetAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(function() { goTo(current + 1); }, 5000);
  }
  resetAuto();
}

document.addEventListener('DOMContentLoaded', initHeader);
