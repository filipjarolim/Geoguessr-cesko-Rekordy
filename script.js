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
    
    // Throttle scroll events for better performance
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if(scrollTimeout) return;
        scrollTimeout = setTimeout(() => {
            updateActiveLink();
            scrollTimeout = null;
        }, 100);
    }, { passive: true });

    // FAQ Accordion functionality
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const button = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        const isOpen = item.hasAttribute('data-faq-open');

        // Helper function to set max height
        const setMaxHeight = (isOpen) => {
            if(isOpen) {
                // Temporarily set to auto to get real height
                answer.style.maxHeight = 'none';
                const height = answer.scrollHeight;
                answer.style.maxHeight = '0px';
                // Force reflow
                answer.offsetHeight;
                // Set to actual height
                answer.style.maxHeight = height + 'px';
            } else {
                answer.style.maxHeight = '0px';
            }
        };

        // Set initial state
        if(isOpen) {
            setMaxHeight(true);
            button.setAttribute('aria-expanded', 'true');
            item.classList.add('faq-open');
        } else {
            answer.style.maxHeight = '0px';
            button.setAttribute('aria-expanded', 'false');
        }

        button.addEventListener('click', () => {
            const isCurrentlyOpen = item.classList.contains('faq-open');
            
            // Toggle current item
            if(isCurrentlyOpen) {
                item.classList.remove('faq-open');
                setMaxHeight(false);
                button.setAttribute('aria-expanded', 'false');
            } else {
                item.classList.add('faq-open');
                setMaxHeight(true);
                button.setAttribute('aria-expanded', 'true');
            }
        });

        // Handle keyboard navigation
        button.addEventListener('keydown', (e) => {
            if(e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            }
        });
    });
});
