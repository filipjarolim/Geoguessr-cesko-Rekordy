document.querySelectorAll('.navigation a').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        targetElement.scrollIntoView({
            behavior: 'smooth'
        });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.navigation a');

    function updateActiveLink() {
        let bestIdx = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        const viewportCenter = window.innerHeight * 0.35; // account for header

        sections.forEach((sec, i) => {
            const rect = sec.getBoundingClientRect();
            const distance = Math.abs(rect.top - viewportCenter);
            if (distance < bestDistance) { bestDistance = distance; bestIdx = i; }
        });

        navLinks.forEach((link) => link.classList.remove('active'));
        if (navLinks[bestIdx]) {
            navLinks[bestIdx].classList.add('active');
            // Update hash for TOC sidebar
            const targetId = sections[bestIdx]?.id;
            if(targetId && location.hash !== `#${targetId}`){
                history.replaceState(null, '', `#${targetId}`);
                window.dispatchEvent(new Event('hashchange'));
            }
        }
    }

    updateActiveLink();
    window.addEventListener('scroll', updateActiveLink);
});
