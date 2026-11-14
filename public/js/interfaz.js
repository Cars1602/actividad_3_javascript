// Mensajes y validación visual compartidos por la tienda y la administración.
window.NexusUI = (() => {
    const temporizadores = new WeakMap();

    function limpiarCampo(campo) {
        const id = campo.getAttribute('data-error-id');
        if (!id) return;
        document.getElementById(id)?.remove();
        const descripciones = (campo.getAttribute('aria-describedby') || '')
            .split(' ').filter(valor => valor && valor !== id);
        if (descripciones.length) campo.setAttribute('aria-describedby', descripciones.join(' '));
        else campo.removeAttribute('aria-describedby');
        campo.removeAttribute('data-error-id');
        campo.removeAttribute('aria-invalid');
    }

    function errorCampo(campo, texto) {
        limpiarCampo(campo);
        const id = 'error-' + campo.id;
        const error = document.createElement('span');
        error.id = id;
        error.className = 'error-campo';
        error.setAttribute('role', 'alert');
        error.textContent = texto;
        (campo.closest('label') || campo.closest('.fila') || campo.parentElement)?.append(error);
        campo.setAttribute('aria-invalid', 'true');
        campo.setAttribute('data-error-id', id);
        campo.setAttribute('aria-describedby', [campo.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
    }

    function limpiarErrores(formulario) {
        if (!formulario) return;
        formulario.querySelectorAll('[data-error-id]').forEach(limpiarCampo);
        formulario.querySelectorAll('.mensaje-formulario').forEach(elemento => elemento.remove());
    }

    function mensaje(texto, error = false, formulario) {
        const form = formulario ? $(formulario) : $();
        let destino = $('#mensaje');
        if (form.length) {
            destino = form.find('.mensaje-formulario');
            if (!destino.length) destino = $('<p class="mensaje-formulario">').prependTo(form);
        }
        const elemento = destino[0];
        if (!elemento) return;
        clearTimeout(temporizadores.get(elemento));
        destino.text(texto).toggleClass('error', error).attr('role', error ? 'alert' : 'status')
            .stop(true, true).show();
        if (!error) {
            temporizadores.set(elemento, setTimeout(() => destino.hide(), 7000));
        }
    }

    document.addEventListener('invalid', event => {
        const campo = event.target;
        if (!campo.id || !campo.closest('form')) return;
        event.preventDefault();
        let texto = 'Revisa el valor de este campo.';
        if (campo.validity.valueMissing) texto = campo.type === 'file' ? 'Selecciona una imagen.' : 'Completa este campo.';
        else if (campo.validity.rangeUnderflow) texto = 'El valor mínimo es ' + campo.min + '.';
        else if (campo.validity.rangeOverflow) texto = 'El valor máximo es ' + campo.max + '.';
        else if (campo.validity.stepMismatch) texto = 'Usa incrementos de ' + campo.step + '.';
        else if (campo.validity.badInput) texto = 'Ingresa un número válido.';
        errorCampo(campo, texto);
        const primero = campo.form?.querySelector(':invalid');
        if (primero === campo) campo.focus();
    }, true);
    document.addEventListener('input', event => limpiarCampo(event.target), true);
    document.addEventListener('change', event => limpiarCampo(event.target), true);
    document.addEventListener('reset', event => limpiarErrores(event.target));

    return { mensaje, errorCampo, limpiarErrores };
})();
