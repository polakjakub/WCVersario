(function ($) {
    'use strict';

    const config = window.wcvariantarioAdmin || null;

    if (!config) {
        return;
    }

    const state = {
        productId: null,
        attributes: [],
        variations: [],
        selectedFirst: null,
        selectedSecond: null,
        selectedFirstTerms: [],
        selectedSecondTerms: [],
        tableState: {},
        loading: false,
    };

    const selectors = {
        modal: '#wcvariantario-modal',
        content: '#wcvariantario-modal .wcvariantario-modal__content',
        title: '#wcvariantario-modal .wcvariantario-modal__title',
    };

    const i18n = config.i18n || {};

    function openModal(productId) {
        state.productId = productId;
        state.loading = true;
        state.attributes = [];
        state.variations = [];
        state.selectedFirst = null;
        state.selectedSecond = null;
        state.selectedFirstTerms = [];
        state.selectedSecondTerms = [];
        state.tableState = {};

        const $modal = $(selectors.modal);
        $modal.addClass('is-open').attr('aria-hidden', 'false');
        renderLoading();
        loadProductData();
    }

    function closeModal() {
        const $modal = $(selectors.modal);
        $modal.removeClass('is-open').attr('aria-hidden', 'true');
        $(selectors.content).empty();
    }

    function renderLoading() {
        $(selectors.title).text(i18n.modalTitle || '');
        $(selectors.content).html('<div class="wcvariantario-loading">' + (i18n.loading || 'Loading…') + '</div>');
    }

    function loadProductData() {
        $.post(
            config.ajaxUrl,
            {
                action: 'wcvariantario_get_product_data',
                nonce: config.nonce,
                product_id: state.productId,
            }
        )
            .done((response) => {
                if (!response || !response.success || !response.data) {
                    renderError(response && response.data ? response.data.message : null);
                    return;
                }

                state.attributes = response.data.attributes || [];
                state.variations = response.data.variations || [];
                state.loading = false;
                renderModalContent();
            })
            .fail(() => {
                renderError();
            });
    }

    function renderError(message) {
        const errorText = message || i18n.error || 'Došlo k chybě.';
        $(selectors.content).html('<div class="wcvariantario-loading wcvariantario-error">' + errorText + '</div>');
    }

    function renderModalContent() {
        if (!state.attributes.length) {
            renderError(i18n.noAttributes);
            return;
        }

        $(selectors.title).text(i18n.modalTitle || '');

        const attributeOptions = state.attributes
            .map((attribute) =>
                '<option value="' + attribute.name + '">' + attribute.label + '</option>'
            )
            .join('');

        const selectsHtml = [
            '<div class="wcvariantario-step">',
            '  <h3>' + (i18n.selectAttributes || '') + '</h3>',
            '  <div class="wcvariantario-selects">',
            '      <label>' + (i18n.firstAttribute || '') + '<br><select class="wcvariantario-attr-select" data-role="first"><option value="">' + (i18n.selectPlaceholder || '') + '</option>' + attributeOptions + '</select></label>',
            '      <label>' + (i18n.secondAttribute || '') + '<br><select class="wcvariantario-attr-select" data-role="second"><option value="">' + (i18n.selectPlaceholder || '') + '</option>' + attributeOptions + '</select></label>',
            '  </div>',
            '</div>'
        ].join('');

        const termsHtml = '<div class="wcvariantario-step wcvariantario-terms" id="wcvariantario-terms"></div>';
        const tableHtml = '<div class="wcvariantario-step" id="wcvariantario-table"></div>';
        const changesHtml = '<div class="wcvariantario-step wcvariantario-changes" id="wcvariantario-changes"></div>';
        const footerHtml = '<div class="wcvariantario-footer"><button type="button" class="button button-primary" id="wcvariantario-confirm">' + (i18n.confirmChanges || '') + '</button></div>';

        $(selectors.content).html(selectsHtml + termsHtml + tableHtml + changesHtml + footerHtml);

        restoreSelectState();
        renderTerms();
        renderTable();
        renderChanges();
    }

    function restoreSelectState() {
        if (state.selectedFirst) {
            $(selectors.content)
                .find('.wcvariantario-attr-select[data-role="first"]').val(state.selectedFirst);
        }
        if (state.selectedSecond) {
            $(selectors.content)
                .find('.wcvariantario-attr-select[data-role="second"]').val(state.selectedSecond);
        }
    }

    function getAttributeByName(name) {
        return state.attributes.find((attribute) => attribute.name === name);
    }

    function renderTerms() {
        const container = $(selectors.content).find('#wcvariantario-terms');
        container.empty();

        const firstAttr = getAttributeByName(state.selectedFirst);
        const secondAttr = getAttributeByName(state.selectedSecond);

        if (!firstAttr || !secondAttr) {
            return;
        }

        container.append(renderTermGroup('first', firstAttr, state.selectedFirstTerms));
        container.append(renderTermGroup('second', secondAttr, state.selectedSecondTerms));
    }

    function renderTermGroup(role, attribute, selectedTerms) {
        const terms = attribute.terms || [];
        const itemsHtml = terms
            .map((term) => {
                const checked = selectedTerms.includes(term.slug) ? 'checked' : '';
                return '<label><input type="checkbox" class="wcvariantario-term" data-role="' + role + '" value="' + term.slug + '" ' + checked + '> ' + term.name + '</label>';
            })
            .join('');

        return (
            '<div class="wcvariantario-terms__group">' +
            '  <h3>' + attribute.label + '</h3>' +
            '  <div class="wcvariantario-terms__items">' + itemsHtml + '</div>' +
            '</div>'
        );
    }

    function renderTable() {
        const container = $(selectors.content).find('#wcvariantario-table');
        container.empty();

        const firstAttr = getAttributeByName(state.selectedFirst);
        const secondAttr = getAttributeByName(state.selectedSecond);

        if (!firstAttr || !secondAttr || !state.selectedFirstTerms.length || !state.selectedSecondTerms.length) {
            return;
        }

        const previousState = state.tableState || {};
        const tableState = {};
        const rows = state.selectedSecondTerms.map((secondTermSlug) => {
            const secondTerm = getTermBySlug(secondAttr, secondTermSlug);
            const cells = state.selectedFirstTerms.map((firstTermSlug) => {
                const firstTerm = getTermBySlug(firstAttr, firstTermSlug);
                const key = buildKey(firstAttr.name, firstTermSlug, secondAttr.name, secondTermSlug);
                const variation = findVariation(firstAttr.name, firstTermSlug, secondAttr.name, secondTermSlug);
                const checked = typeof previousState[key] !== 'undefined' ? previousState[key] : !!variation;
                tableState[key] = checked;
                const inputId = 'wcvariantario-cell-' + firstTermSlug + '-' + secondTermSlug;
                const label = '<label for="' + inputId + '"><span class="screen-reader-text">' + firstTerm.name + ' / ' + secondTerm.name + '</span></label>';
                return '<td><input type="checkbox" data-key="' + key + '" id="' + inputId + '" ' + (checked ? 'checked' : '') + '> ' + label + '</td>';
            });
            return '<tr><th scope="row">' + secondTerm.name + '</th>' + cells.join('') + '</tr>';
        });

        state.tableState = tableState;

        const headerCells = state.selectedFirstTerms
            .map((firstTermSlug) => {
                const term = getTermBySlug(firstAttr, firstTermSlug);
                return '<th scope="col">' + term.name + '</th>';
            })
            .join('');

        const tableHtml = [
            '<div class="wcvariantario-table-wrapper">',
            '  <table class="wcvariantario-table">',
            '      <thead><tr><th></th>' + headerCells + '</tr></thead>',
            '      <tbody>' + rows.join('') + '</tbody>',
            '  </table>',
            '</div>'
        ].join('');

        container.html(tableHtml);
    }

    function renderChanges() {
        const container = $(selectors.content).find('#wcvariantario-changes');
        container.empty();

        const firstAttr = getAttributeByName(state.selectedFirst);
        const secondAttr = getAttributeByName(state.selectedSecond);

        if (!firstAttr || !secondAttr || !state.selectedFirstTerms.length || !state.selectedSecondTerms.length) {
            return;
        }

        const changes = [];

        state.selectedSecondTerms.forEach((secondSlug) => {
            const secondTerm = getTermBySlug(secondAttr, secondSlug);
            state.selectedFirstTerms.forEach((firstSlug) => {
                const firstTerm = getTermBySlug(firstAttr, firstSlug);
                const key = buildKey(firstAttr.name, firstSlug, secondAttr.name, secondSlug);
                const variation = findVariation(firstAttr.name, firstSlug, secondAttr.name, secondSlug);
                const initialState = !!variation;
                const finalState = !!state.tableState[key];

                if (initialState === finalState) {
                    return;
                }

                if (finalState && !initialState) {
                    changes.push('<li>' + firstAttr.label + ' ' + firstTerm.name + ' / ' + secondAttr.label + ' ' + secondTerm.name + ' – ' + (i18n.willCreate || '') + '</li>');
                } else if (!finalState && initialState) {
                    changes.push('<li>' + firstAttr.label + ' ' + firstTerm.name + ' / ' + secondAttr.label + ' ' + secondTerm.name + ' – ' + (i18n.willDelete || '') + '</li>');
                }
            });
        });

        const heading = '<h3>' + (i18n.changesHeading || '') + '</h3>';
        const list = changes.length ? '<ul>' + changes.join('') + '</ul>' : '<p>' + (i18n.noChanges || '') + '</p>';
        container.html(heading + list);
    }

    function getTermBySlug(attribute, slug) {
        return (attribute.terms || []).find((term) => term.slug === slug) || { name: slug };
    }

    function buildKey(attrOne, termOne, attrTwo, termTwo) {
        return attrOne + ':' + termOne + '|' + attrTwo + ':' + termTwo;
    }

    function findVariation(attrOne, termOne, attrTwo, termTwo) {
        return state.variations.find((variation) => {
            if (!variation.attributes) {
                return false;
            }
            const attrA = variation.attributes[attrOne];
            const attrB = variation.attributes[attrTwo];
            return attrA === termOne && attrB === termTwo;
        }) || null;
    }

    function computeChangesPayload() {
        const firstAttr = getAttributeByName(state.selectedFirst);
        const secondAttr = getAttributeByName(state.selectedSecond);

        if (!firstAttr || !secondAttr) {
            return { create: [], delete: [] };
        }

        const toCreate = [];
        const toDelete = [];

        state.selectedSecondTerms.forEach((secondSlug) => {
            state.selectedFirstTerms.forEach((firstSlug) => {
                const key = buildKey(firstAttr.name, firstSlug, secondAttr.name, secondSlug);
                const variation = findVariation(firstAttr.name, firstSlug, secondAttr.name, secondSlug);
                const initialState = !!variation;
                const finalState = !!state.tableState[key];

                if (finalState && !initialState) {
                    toCreate.push({
                        attributes: {
                            [firstAttr.name]: firstSlug,
                            [secondAttr.name]: secondSlug,
                        },
                    });
                } else if (!finalState && initialState) {
                    toDelete.push(variation.id);
                }
            });
        });

        return { create: toCreate, delete: toDelete };
    }

    function handleConfirm() {
        const payload = computeChangesPayload();

        if (!payload.create.length && !payload.delete.length) {
            window.alert(i18n.noChanges || 'Žádné změny.');
            return;
        }

        const postData = {
            action: 'wcvariantario_save_variations',
            nonce: config.nonce,
            product_id: state.productId,
            create: JSON.stringify(payload.create),
            delete: JSON.stringify(payload.delete),
        };

        const $button = $(selectors.content).find('#wcvariantario-confirm');
        $button.prop('disabled', true).addClass('button-primary-disabled');

        $.post(config.ajaxUrl, postData)
            .done((response) => {
                if (!response || !response.success) {
                    window.alert((response && response.data && response.data.message) || i18n.error || 'Došlo k chybě.');
                    $button.prop('disabled', false).removeClass('button-primary-disabled');
                    return;
                }

                window.location.reload();
            })
            .fail(() => {
                window.alert(i18n.error || 'Došlo k chybě.');
                $button.prop('disabled', false).removeClass('button-primary-disabled');
            });
    }

    function handleAttributeChange(role, value) {
        if (role === 'first') {
            state.selectedFirst = value || null;
        } else if (role === 'second') {
            state.selectedSecond = value || null;
        }

        if (state.selectedFirst && state.selectedSecond && state.selectedFirst === state.selectedSecond) {
            if (role === 'first') {
                state.selectedSecond = null;
                state.selectedSecondTerms = [];
                $(selectors.content).find('.wcvariantario-attr-select[data-role="second"]').val('');
            } else {
                state.selectedFirst = null;
                state.selectedFirstTerms = [];
                $(selectors.content).find('.wcvariantario-attr-select[data-role="first"]').val('');
            }
            window.alert(i18n.differentAttributes || 'Vyberte dvě různé vlastnosti.');
        }

        if (role === 'first') {
            state.selectedFirstTerms = [];
        } else {
            state.selectedSecondTerms = [];
        }

        state.tableState = {};

        renderTerms();
        renderTable();
        renderChanges();
    }

    function handleTermToggle(role, slug, checked) {
        const collection = role === 'first' ? state.selectedFirstTerms : state.selectedSecondTerms;
        const index = collection.indexOf(slug);

        if (checked && index === -1) {
            collection.push(slug);
        } else if (!checked && index !== -1) {
            collection.splice(index, 1);
        }

        renderTable();
        renderChanges();
    }

    function handleCellToggle(key, checked) {
        state.tableState[key] = checked;
        renderChanges();
    }

    $(document).on('click', '.wcvariantario-open', function (event) {
        event.preventDefault();

        const productType = $('#product-type').val();
        if (productType !== 'variable') {
            window.alert(i18n.requiresVariable || 'Tato funkce je dostupná pouze pro variabilní produkty.');
            return;
        }

        openModal($(this).data('product-id'));
    });

    $(document).on('click', '.wcvariantario-modal__close, .wcvariantario-modal__backdrop', function (event) {
        event.preventDefault();
        closeModal();
    });

    $(document).on('change', '.wcvariantario-attr-select', function () {
        const role = $(this).data('role');
        const value = $(this).val();
        handleAttributeChange(role, value);
    });

    $(document).on('change', '.wcvariantario-term', function () {
        const role = $(this).data('role');
        const slug = $(this).val();
        const checked = $(this).is(':checked');
        handleTermToggle(role, slug, checked);
    });

    $(document).on('change', '#wcvariantario-table input[type="checkbox"]', function () {
        const key = $(this).data('key');
        const checked = $(this).is(':checked');
        handleCellToggle(key, checked);
    });

    $(document).on('click', '#wcvariantario-confirm', function (event) {
        event.preventDefault();
        const firstAttr = getAttributeByName(state.selectedFirst);
        const secondAttr = getAttributeByName(state.selectedSecond);

        if (!firstAttr || !secondAttr || !state.selectedFirstTerms.length || !state.selectedSecondTerms.length) {
            window.alert(i18n.invalidSelection || 'Vyberte možnosti pro obě vlastnosti.');
            return;
        }

        handleConfirm();
    });
})(jQuery);
